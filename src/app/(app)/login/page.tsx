import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

type Props = PageProps<"/login">;

export default function LoginPage(props: Props) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 pt-4 sm:pt-12">
      <header className="flex flex-col gap-1">
        <p className="kl-eyebrow">Welcome</p>
        <h1 className="kl-headline text-4xl sm:text-5xl">
          Sign in to <span className="text-amber">Kicklight</span>
        </h1>
      </header>
      <Suspense fallback={<LoginForm next="/" />}>
        <Form searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}

/** Where to go after signing in, and any error from the email link, come from the URL. */
async function Form({ searchParams }: { searchParams: Props["searchParams"] }) {
  const sp = await searchParams;
  const rawNext = typeof sp.next === "string" ? sp.next : "/";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const error = typeof sp.error === "string" ? sp.error : undefined;
  return <LoginForm next={next} error={error} />;
}
