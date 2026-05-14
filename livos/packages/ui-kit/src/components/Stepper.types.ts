export interface StepperStep {
  id?: string;
  label: string;
}

export interface StepperProps {
  steps: StepperStep[];
  current: number;
  className?: string;
}
