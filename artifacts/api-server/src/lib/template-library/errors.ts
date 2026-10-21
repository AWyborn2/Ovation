/** A template-library failure the routes answer with its status and body. */
export class TemplateLibraryError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    readonly body: Record<string, unknown>,
  ) {
    super(String(body.error ?? "template library error"));
  }
}

export const libraryNotFound = (error = "That template isn't in the library.") =>
  new TemplateLibraryError(404, { error });

export const copyNotFound = (error = "That template isn't one of your club's.") =>
  new TemplateLibraryError(404, { error });
