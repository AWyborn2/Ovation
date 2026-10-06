/**
 * Test fixture for the PlayHQ participant export (squad import, plan
 * 2026-10-06-002 U3). The header is the export's full, real header row; every
 * row is FAKE — invented names, 04xx numbers and example.com addresses. Rows
 * fill the discarded columns (Disability, WWC, emergency contact, school…)
 * with recognisable sentinels so tests can prove none of them is ever stored.
 */

export const PLAYHQ_PARTICIPANT_HEADER =
  "Registration Timestamp,First Name,Last Name,Preferred Name,Profile ID,Date of Birth,Gender,Age Group,Role,Team,Player Point Value,Grade,New To Association,New To Club,Source,Status,Cancellation Reason,Restriction,Permit From,Permit To,School Details,School Year,Club,Host Organisation,Host Organisation ID,Competition,Competition Type,Format,Season,Management Access,Privacy Setting,Video Consent Setting,Opted In To Marketing,Account Holder,Account Holder Mobile,Account Holder Email,Participant Suburb/Town,Participant Postcode,Participant State/County/City,Participant Country,Aboriginal/Torres Strait Islander,Participant Country of Birth,Parent/Guardian Born Overseas?,Parent/Guardian1 Country Of Birth,Parent/Guardian2 Country Of Birth,Disability,Disability Type,Disability Other,Disability Assistance,WWC Number,WWC Expiry Date,WWC State of Issue,Parent/Guardian1 First Name,Parent/Guardian1 Last Name,Parent/Guardian1 Mobile Number,Parent/Guardian1 Email,Parent/Guardian1 Suburb/Town,Parent/Guardian1 Postcode,Parent/Guardian1 State/County/City,Parent/Guardian1 Country,Parent/Guardian2 First Name,Parent/Guardian2 Last Name,Parent/Guardian2 Mobile Number,Parent/Guardian2 Email,Parent/Guardian2 Suburb/Town,Parent/Guardian2 Postcode,Parent/Guardian2 State/County/City,Parent/Guardian2 Country,Emergency Contact First Name,Emergency Contact Last Name,Emergency Contact Mobile Number,Emergency Contact Email,Emergency Contact Relationship";

export const PLAYHQ_PARTICIPANT_COLUMNS = PLAYHQ_PARTICIPANT_HEADER.split(",");

/** Values for discarded columns that must never reach the database (R3). */
export const DISCARDED_SENTINELS = {
  Gender: "Nonbinary-SENTINEL",
  "Aboriginal/Torres Strait Islander": "Yes-SENTINEL-ATSI",
  "Participant Country of Birth": "Atlantis-SENTINEL",
  Disability: "Yes-SENTINEL-DISABILITY",
  "Disability Type": "SENTINEL-DISABILITY-TYPE",
  "WWC Number": "WWC-SENTINEL-1234567",
  "School Details": "SENTINEL Primary School",
  "Participant Suburb/Town": "Sentinelville",
  "Participant Postcode": "6999-SENTINEL",
  "Opted In To Marketing": "SENTINEL-MARKETING",
  "Video Consent Setting": "SENTINEL-VIDEO",
  "Emergency Contact First Name": "Emma-SENTINEL",
  "Emergency Contact Mobile Number": "0499 999 001",
  "Emergency Contact Email": "sentinel.emergency@example.com",
} as const;

export const FAKE_HOST_ORG_ID = "4f0c0de0-0000-4000-8000-00000000f00d";
export const FAKE_SEASON = "2026/27";

/** One export row; unspecified columns are blank, discarded ones get sentinels. */
export function participantRow(values: Record<string, string>): Record<string, string> {
  return {
    "Registration Timestamp": "01/08/2026 10:00",
    Role: "Player",
    Status: "Active",
    Season: FAKE_SEASON,
    Club: "Fakeville Cricket Club",
    "Host Organisation": "Fakeville Cricket Club",
    "Host Organisation ID": FAKE_HOST_ORG_ID,
    Competition: "Fake Association Senior Competition",
    Format: "Two Day",
    "Privacy Setting": "Public",
    ...DISCARDED_SENTINELS,
    ...values,
  };
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** The export CSV text for `rows` under the full header (or a custom one). */
export function buildParticipantCsv(
  rows: Array<Record<string, string>>,
  columns: string[] = PLAYHQ_PARTICIPANT_COLUMNS,
): string {
  const lines = [columns.map(csvCell).join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c] ?? "")).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** An adult A Grade player. */
export const ADULT = participantRow({
  "First Name": "Alex",
  "Last Name": "Fakerton",
  "Preferred Name": "Al",
  "Profile ID": "a0000000-0000-4000-8000-000000000001",
  "Date of Birth": "14/03/1995",
  "Age Group": "Open",
  Team: "Fakeville A Grade",
  Grade: "A Grade",
  "Account Holder": "Alex Fakerton",
  "Account Holder Mobile": "0400 000 001",
  "Account Holder Email": "alex.fakerton@example.com",
});

/** A 15-year-old in a junior grade, contacted through two guardians. */
export const JUNIOR = participantRow({
  "First Name": "Jordan",
  "Last Name": "Testwood",
  "Profile ID": "a0000000-0000-4000-8000-000000000002",
  "Date of Birth": "2011-06-20",
  "Age Group": "Under 16",
  Team: "Fakeville U16 Blue",
  Grade: "Under 16 Division 1",
  "Account Holder": "Pat Testwood",
  "Account Holder Mobile": "0400 000 010",
  "Account Holder Email": "pat.testwood@example.com",
  "Parent/Guardian1 First Name": "Pat",
  "Parent/Guardian1 Last Name": "Testwood",
  "Parent/Guardian1 Mobile Number": "0400 000 011",
  "Parent/Guardian1 Email": "pat.testwood@example.com",
  "Parent/Guardian2 First Name": "Robin",
  "Parent/Guardian2 Last Name": "Testwood",
  "Parent/Guardian2 Mobile Number": "0400 000 012",
  "Parent/Guardian2 Email": "robin.testwood@example.com",
});

/** A coach registration — skipped (R4). */
export const COACH = participantRow({
  "First Name": "Casey",
  "Last Name": "Coachman",
  "Profile ID": "a0000000-0000-4000-8000-000000000003",
  "Date of Birth": "02/02/1980",
  Role: "Coach",
  "Account Holder Mobile": "0400 000 020",
});

/** A cancelled registration — skipped (R4). */
export const CANCELLED = participantRow({
  "First Name": "Drew",
  "Last Name": "Gonebye",
  "Profile ID": "a0000000-0000-4000-8000-000000000004",
  "Date of Birth": "05/05/1990",
  Status: "Cancelled",
  "Cancellation Reason": "Moved interstate",
  "Account Holder Mobile": "0400 000 030",
});
