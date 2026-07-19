import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/cricket-club";

export function BattingScorecard() {
  return (
    <Table>
      <TableCaption>First Grade batting — Round 8 vs Mandurah</TableCaption>
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
          <TableCell style={{ textAlign: "right" }}>78*</TableCell>
          <TableCell style={{ textAlign: "right" }}>64</TableCell>
          <TableCell style={{ textAlign: "right" }}>121.9</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>T. Nguyen</TableCell>
          <TableCell style={{ textAlign: "right" }}>45</TableCell>
          <TableCell style={{ textAlign: "right" }}>52</TableCell>
          <TableCell style={{ textAlign: "right" }}>86.5</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>M. Della Bosca</TableCell>
          <TableCell style={{ textAlign: "right" }}>31</TableCell>
          <TableCell style={{ textAlign: "right" }}>40</TableCell>
          <TableCell style={{ textAlign: "right" }}>77.5</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>S. Rimmer</TableCell>
          <TableCell style={{ textAlign: "right" }}>22</TableCell>
          <TableCell style={{ textAlign: "right" }}>18</TableCell>
          <TableCell style={{ textAlign: "right" }}>122.2</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>B. Hooper</TableCell>
          <TableCell style={{ textAlign: "right" }}>14</TableCell>
          <TableCell style={{ textAlign: "right" }}>25</TableCell>
          <TableCell style={{ textAlign: "right" }}>56.0</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
