/**
 * Google Drive picker for the photo library. Google's scripts load only when
 * an admin opens the picker; they sign in with Google (drive.file scope, so
 * this app can read only the files they pick) and choose up to 50 photos.
 */
import type { GoogleDriveConfig } from "@workspace/api-client-react";

export type DrivePick = { accessToken: string; files: { id: string; name: string }[] };

/** The slice of Google's browser APIs the picker uses. */
type GoogleApis = {
  accounts: {
    oauth2: {
      initTokenClient(opts: {
        client_id: string;
        scope: string;
        callback: (resp: { access_token?: string; error?: string }) => void;
        error_callback?: (err: { type?: string }) => void;
      }): { requestAccessToken(opts?: { prompt?: string }): void };
    };
  };
  picker: {
    Action: { PICKED: string; CANCEL: string };
    ViewId: { DOCS_IMAGES: string };
    Feature: { MULTISELECT_ENABLED: string };
    DocsView: new (viewId: string) => { setIncludeFolders(on: boolean): unknown };
    PickerBuilder: new () => PickerBuilder;
  };
};
type PickerBuilder = {
  setAppId(id: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  addView(view: unknown): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  setMaxItems(n: number): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setCallback(cb: (data: PickerResult) => void): PickerBuilder;
  build(): { setVisible(on: boolean): void };
};
type PickerResult = { action: string; docs?: { id: string; name?: string }[] };
type GoogleWindow = Window & {
  google?: GoogleApis;
  gapi?: { load(lib: string, cb: () => void): void };
};

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const MAX_DRIVE_PICK = 50;

const loaded = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  let p = loaded.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loaded.delete(src);
        reject(new Error("Couldn't reach Google. Check your connection and try again."));
      };
      document.head.appendChild(s);
    });
    loaded.set(src, p);
  }
  return p;
}

/**
 * Sign in with Google and pick photos. Resolves null when the admin closes the
 * picker without choosing.
 */
export async function pickDrivePhotos(config: GoogleDriveConfig): Promise<DrivePick | null> {
  const w = window as GoogleWindow;
  await Promise.all([
    loadScript("https://accounts.google.com/gsi/client"),
    loadScript("https://apis.google.com/js/api.js"),
  ]);
  await new Promise<void>((resolve) => w.gapi!.load("picker", resolve));
  const google = w.google!;

  const accessToken = await new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: config.clientId,
      scope: DRIVE_SCOPE,
      callback: (resp) =>
        resp.access_token
          ? resolve(resp.access_token)
          : reject(new Error("Google sign-in didn't finish.")),
      error_callback: () => reject(new Error("Google sign-in was closed.")),
    });
    client.requestAccessToken({ prompt: "" });
  });

  return new Promise<DrivePick | null>((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS_IMAGES);
    view.setIncludeFolders(true);
    new google.picker.PickerBuilder()
      .setTitle("Choose photos for your library")
      .setAppId(config.appId)
      .setOAuthToken(accessToken)
      .setDeveloperKey(config.apiKey)
      .addView(view)
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setMaxItems(MAX_DRIVE_PICK)
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          const files = (data.docs ?? []).map((d) => ({ id: d.id, name: d.name ?? d.id }));
          resolve(files.length ? { accessToken, files } : null);
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build()
      .setVisible(true);
  });
}
