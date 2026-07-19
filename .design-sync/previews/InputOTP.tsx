import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
  Label,
} from "@workspace/cricket-club";

export function SixDigit() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Label htmlFor="admin-otp">Club admin verification code</Label>
      <InputOTP id="admin-otp" maxLength={6} defaultValue="482913">
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}

export function FourDigitPin() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Label htmlFor="scorer-pin">Scorer PIN — Rushton Park gate</Label>
      <InputOTP id="scorer-pin" maxLength={4} defaultValue="2026">
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}

export function Empty() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Label htmlFor="invite-otp">Enter the code sent to your email</Label>
      <InputOTP id="invite-otp" maxLength={6}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}
