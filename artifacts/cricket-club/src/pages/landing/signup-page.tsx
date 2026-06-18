import { Link } from "wouter";
import { Button } from "@/components/ui/button";

/**
 * Self-serve signup. Placeholder in Phase 2a (landing only); the pick-your-club
 * wizard is wired to the platform signup API in Phase 2b.
 */
export default function SignupPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Find your club</h1>
      <p className="mt-3 text-muted-foreground">
        Self-serve onboarding is coming shortly. In the meantime, get in touch and
        we'll set your club up.
      </p>
      <Link href="/" className="mt-8">
        <Button variant="outline">Back to home</Button>
      </Link>
    </div>
  );
}
