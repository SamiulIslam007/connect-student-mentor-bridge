import { consentDocument } from "../../lib/consent-document";
import { strings } from "../../lib/strings";

/** Public and session-free: the document a registration consent record names (D-82). */
export default function TermsPage() {
  const document = consentDocument("terms");

  return (
    <main>
      <h1>{document.title}</h1>
      <p>{document.draftNotice}</p>
      <p>
        {strings.legal.versionLabel}: {document.version}
      </p>
      {document.sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          <p>{section.body}</p>
        </section>
      ))}
      <p>
        <a href="/privacy">{strings.legal.privacy.title}</a>
      </p>
    </main>
  );
}
