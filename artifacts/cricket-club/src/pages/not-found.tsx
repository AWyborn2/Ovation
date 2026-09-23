import { Link } from "wouter";
import { Container, Eyebrow } from "@/components/broadcast";

export default function NotFound() {
  return (
    <Container page className="flex min-h-[60vh] flex-col items-start justify-center gap-5 py-16">
      <Eyebrow accent>404</Eyebrow>
      <h1 className="text-[clamp(44px,6.4vw,92px)] leading-[.95]">Given out!</h1>
      <p className="max-w-[46ch] text-[15px] text-muted-foreground">
        The page you're looking for has been retired to the pavilion.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex h-[46px] items-center rounded-sm bg-primary px-5 font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
        >
          Back to home
        </Link>
        <Link
          href="/players"
          className="inline-flex h-[46px] items-center rounded-sm border px-5 font-bold transition-colors hover:border-primary"
        >
          Browse players
        </Link>
      </div>
    </Container>
  );
}
