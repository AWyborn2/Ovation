import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
      <div className="bg-muted p-6 rounded-full">
        <AlertCircle className="h-16 w-16 text-muted-foreground" />
      </div>
      
      <div className="space-y-2">
        <h1 className="text-4xl font-serif font-bold text-primary">Given Out!</h1>
        <p className="text-xl text-muted-foreground max-w-md mx-auto">
          The page you're looking for has been retired to the pavilion.
        </p>
      </div>

      <div className="pt-4">
        <Link href="/">
          <Button size="lg" className="font-semibold">
            Return to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
