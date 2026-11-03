import { APP_NAME } from "@connect/config";

import { strings } from "../lib/strings";

export default function HomePage() {
  return (
    <main>
      <h1>{APP_NAME}</h1>
      <p>{strings.home.title}</p>
      <p>
        <a href="/sign-up">{strings.home.signUp}</a> · <a href="/sign-in">{strings.home.signIn}</a>
      </p>
    </main>
  );
}
