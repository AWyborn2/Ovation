import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { CoachTour } from "@/components/coach-tour";
import { WelcomeGuide } from "@/components/welcome-guide";
import { hasSeenWelcome, markWelcomeSeen, tourSteps } from "@/lib/onboarding";

type OnboardingContextValue = {
  // Re-open the welcome sheet (which can then start the tour).
  showWelcome: () => void;
  // Jump straight into the coachmark tour.
  startTour: () => void;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return ctx;
}

const STEPS = tourSteps();

export function OnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  // On first launch, auto-show the welcome sheet.
  useEffect(() => {
    let cancelled = false;
    hasSeenWelcome().then((seen) => {
      if (!cancelled && !seen) setWelcomeOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dismissWelcome = useCallback(() => {
    void markWelcomeSeen();
    setWelcomeOpen(false);
  }, []);

  const startTour = useCallback(() => {
    void markWelcomeSeen();
    setWelcomeOpen(false);
    // Let the welcome modal finish dismissing before the overlay mounts.
    setTimeout(() => setTourOpen(true), 250);
  }, []);

  const showWelcome = useCallback(() => setWelcomeOpen(true), []);

  return (
    <OnboardingContext.Provider value={{ showWelcome, startTour }}>
      {children}
      <WelcomeGuide
        visible={welcomeOpen}
        onDismiss={dismissWelcome}
        onStartTour={startTour}
      />
      <CoachTour
        visible={tourOpen}
        steps={STEPS}
        onClose={() => setTourOpen(false)}
      />
    </OnboardingContext.Provider>
  );
}
