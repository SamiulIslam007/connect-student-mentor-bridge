import { strings } from "../../lib/strings";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const message =
    status === "verified"
      ? strings.verify.verified
      : status === "error"
        ? strings.verify.error
        : strings.verify.invalid;

  return (
    <main>
      <h1>{strings.verify.title}</h1>
      <p role="status">{message}</p>
      <p>
        <a href="/sign-in">{strings.signIn.title}</a>
      </p>
    </main>
  );
}
