import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const rawNext = typeof sp.next === "string" ? sp.next : "/";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const error = typeof sp.error === "string" ? sp.error : undefined;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 pt-4 sm:pt-12">
      <header className="flex flex-col gap-1">
        <p className="kl-eyebrow">Welcome</p>
        <h1 className="kl-headline text-4xl sm:text-5xl">
          Sign in to <span className="text-amber">Kicklight</span>
        </h1>
      </header>
      <LoginForm next={next} error={error} />
    </div>
  );
}
