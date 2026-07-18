import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/cricket-club";

export function CaptionBelowScorecard() {
  return (
    <Table>
      <TableCaption>
        Season 2025/26 top run-scorers. Caption renders below the table in
        muted foreground text.
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Player</TableHead>
          <TableHead style={{ textAlign: "right" }}>Runs</TableHead>
          <TableHead style={{ textAlign: "right" }}>Balls</TableHead>
          <TableHead style={{ textAlign: "right" }}>SR</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>J. Carter</TableCell>
          <TableCell style={{ textAlign: "right" }}>612</TableCell>
          <TableCell style={{ textAlign: "right" }}>701</TableCell>
          <TableCell style={{ textAlign: "right" }}>87.3</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>T. Nguyen</TableCell>
          <TableCell style={{ textAlign: "right" }}>548</TableCell>
          <TableCell style={{ textAlign: "right" }}>623</TableCell>
          <TableCell style={{ textAlign: "right" }}>88.0</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>M. Della Bosca</TableCell>
          <TableCell style={{ textAlign: "right" }}>475</TableCell>
          <TableCell style={{ textAlign: "right" }}>590</TableCell>
          <TableCell style={{ textAlign: "right" }}>80.5</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>S. Rimmer</TableCell>
          <TableCell style={{ textAlign: "right" }}>391</TableCell>
          <TableCell style={{ textAlign: "right" }}>402</TableCell>
          <TableCell style={{ textAlign: "right" }}>97.3</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
