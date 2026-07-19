import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/cricket-club";

export function CellsInScorecard() {
  return (
    <Table>
      <TableCaption>
        TableCell carries the data — text left-aligned, numbers right-aligned,
        the not-out score emphasised.
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
          <TableCell style={{ fontWeight: 500 }}>J. Carter</TableCell>
          <TableCell style={{ textAlign: "right", fontWeight: 600 }}>
            78*
          </TableCell>
          <TableCell style={{ textAlign: "right" }}>64</TableCell>
          <TableCell style={{ textAlign: "right" }}>121.9</TableCell>
        </TableRow>
        <TableRow>
          <TableCell style={{ fontWeight: 500 }}>T. Nguyen</TableCell>
          <TableCell style={{ textAlign: "right" }}>45</TableCell>
          <TableCell style={{ textAlign: "right" }}>52</TableCell>
          <TableCell style={{ textAlign: "right" }}>86.5</TableCell>
        </TableRow>
        <TableRow>
          <TableCell style={{ fontWeight: 500 }}>M. Della Bosca</TableCell>
          <TableCell style={{ textAlign: "right" }}>31</TableCell>
          <TableCell style={{ textAlign: "right" }}>40</TableCell>
          <TableCell style={{ textAlign: "right" }}>77.5</TableCell>
        </TableRow>
        <TableRow>
          <TableCell style={{ fontWeight: 500 }}>S. Rimmer</TableCell>
          <TableCell style={{ textAlign: "right" }}>22</TableCell>
          <TableCell style={{ textAlign: "right" }}>18</TableCell>
          <TableCell style={{ textAlign: "right" }}>122.2</TableCell>
        </TableRow>
        <TableRow>
          <TableCell style={{ fontWeight: 500 }}>B. Hooper</TableCell>
          <TableCell style={{ textAlign: "right" }}>14</TableCell>
          <TableCell style={{ textAlign: "right" }}>25</TableCell>
          <TableCell style={{ textAlign: "right" }}>56.0</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
