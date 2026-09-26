import type { ReactNode } from "react";
import { PlatformFooter, PlatformHeader } from "./platform-chrome";

/**
 * Privacy policy and terms of use for the Ovation platform, served on the apex
 * host (/privacy, /terms). The privacy URL is the one registered on the Google
 * OAuth consent screen for Drive photo import, so keep the Google section in
 * step with lib/integrations/google-drive.ts.
 */

export const LEGAL_CONTACT_EMAIL = "ash@sproutandspark.com.au";
const UPDATED = "26 September 2026";

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PlatformHeader />
      <main className="mx-auto max-w-3xl px-[var(--pad)] py-12">
        <h1 className="text-[clamp(32px,4vw,48px)] leading-none">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated {UPDATED}</p>
        <div className="mt-8 space-y-4 leading-relaxed [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:leading-none [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
          {children}
        </div>
      </main>
      <PlatformFooter />
    </div>
  );
}

const Mail = () => (
  <a className="text-primary-text underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
    {LEGAL_CONTACT_EMAIL}
  </a>
);

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <p>
        Ovation (&ldquo;Ovation&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) runs ovationcc.app and
        the cricket club websites hosted on it (for example <em>yourclub</em>.ovationcc.app). This
        policy explains what personal information we handle, why, and the choices you have. We
        handle personal information in line with the Australian Privacy Principles.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Club administrator accounts:</strong> name, email address and a securely hashed
          password, plus sign-in session records.
        </li>
        <li>
          <strong>Cricket records:</strong> player names, match scorecards, statistics, honours and
          club history, drawn from association and club records or entered by club administrators.
          These are published on club sites as part of the club&rsquo;s history.
        </li>
        <li>
          <strong>Photos and content clubs upload:</strong> images and text a club administrator
          adds, including photos imported from Google Drive (see below).
        </li>
        <li>
          <strong>Technical information:</strong> a session cookie that keeps administrators signed
          in, and standard server logs (such as IP address and request time) used for security and
          troubleshooting. We do not use advertising or tracking cookies.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To run club websites and show each club&rsquo;s stats, records and history.</li>
        <li>To let administrators sign in and manage their club&rsquo;s content.</li>
        <li>
          To send service emails, such as password resets and account notices (sent through our
          email provider, Resend).
        </li>
        <li>To keep the service secure and fix problems.</li>
      </ul>
      <p>We do not sell personal information or use it for advertising.</p>

      <h2>Google Drive photo import</h2>
      <p>
        Club administrators can choose to import photos from their Google Drive into their
        club&rsquo;s photo library. When they do:
      </p>
      <ul>
        <li>
          Ovation requests only the <code>drive.file</code> permission, which gives access solely to
          the files the administrator picks in the Google file picker. We cannot see or list any
          other files in their Drive.
        </li>
        <li>
          The picked image files are copied into that club&rsquo;s photo library on Ovation, where
          the club uses them on its website and social media posts.
        </li>
        <li>
          The short-lived Google access token is used only to download the picked files during that
          request. It is not stored or logged, and we keep no ongoing access to the Drive.
        </li>
        <li>
          We do not use Google user data for advertising, do not sell it, do not use it to train AI
          models, and do not transfer it to anyone except as needed to provide this feature, to
          comply with the law, or with the user&rsquo;s consent.
        </li>
      </ul>
      <p>
        Ovation&rsquo;s use and transfer of information received from Google APIs adheres to the{" "}
        <a
          className="text-primary-text underline"
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. You can remove Ovation&rsquo;s access at any time
        from your{" "}
        <a
          className="text-primary-text underline"
          href="https://myaccount.google.com/permissions"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google account permissions
        </a>
        . Imported photos can be deleted from the club&rsquo;s photo library by a club
        administrator.
      </p>

      <h2>Sharing and storage</h2>
      <p>
        We use service providers to host the platform, store data and files, and send email. They
        handle information only on our behalf. Some of these providers may store data on servers
        outside Australia. We may also disclose information where required by law.
      </p>

      <h2>Keeping and deleting information</h2>
      <p>
        We keep club content for as long as the club uses Ovation, because it forms the club&rsquo;s
        historical record. Administrator accounts can be removed by the club or by contacting us.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask to see or correct personal information we hold about you, or ask for a
        player&rsquo;s profile to be hidden or removed, by emailing <Mail />. If you have a
        complaint about how we handled your information, contact us first; if you are not satisfied,
        you can contact the Office of the Australian Information Commissioner (oaic.gov.au).
      </p>

      <h2>Changes</h2>
      <p>We may update this policy. The date at the top shows when it last changed.</p>

      <h2>Contact</h2>
      <p>
        Questions about privacy: <Mail />
      </p>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of Use">
      <p>
        These terms apply to ovationcc.app and the club websites hosted on it. By using Ovation you
        agree to them.
      </p>

      <h2>The service</h2>
      <p>
        Ovation provides cricket clubs with websites for their stats, records and history, and tools
        for club administrators. Features may change as the platform develops. Statistics are
        compiled from association and club records and may contain errors; they are provided for
        information only.
      </p>

      <h2>Club administrators</h2>
      <ul>
        <li>Keep your sign-in details secure and tell us if you think your account is misused.</li>
        <li>
          Only upload content you have the right to use, and that is not unlawful, offensive or
          misleading. You keep ownership of what you upload, and you let us host and display it on
          your club&rsquo;s site.
        </li>
        <li>
          Take care with photos of people, especially children, and follow your club&rsquo;s and
          association&rsquo;s policies before publishing them.
        </li>
      </ul>

      <h2>Acceptable use</h2>
      <p>
        Don&rsquo;t attempt to access other clubs&rsquo; administration areas, disrupt the service,
        or scrape it at scale. We may suspend access that breaches these terms.
      </p>

      <h2>Liability</h2>
      <p>
        Ovation is provided &ldquo;as is&rdquo;. To the extent the law allows, we are not liable for
        indirect loss arising from use of the service. Nothing in these terms limits rights you have
        under the Australian Consumer Law.
      </p>

      <h2>Privacy</h2>
      <p>
        Our{" "}
        <a className="text-primary-text underline" href="/privacy">
          Privacy Policy
        </a>{" "}
        explains how we handle personal information.
      </p>

      <h2>Contact</h2>
      <p>
        <Mail />
      </p>
    </LegalShell>
  );
}
