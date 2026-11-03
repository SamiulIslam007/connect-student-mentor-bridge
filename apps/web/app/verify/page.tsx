import { strings } from "../../lib/strings";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const verified = status === "verified";

  return (
    <main>
      <h1>{strings.verify.title}</h1>
      <p role="status">{verified ? strings.verify.verified : strings.verify.invalid}</p>
      <p>
        <a href="/sign-in">{strings.signIn.title}</a>
      </p>
    </main>
  );
}
