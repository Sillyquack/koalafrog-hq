import { benchmarkDeodorantConcept } from "../domain/deodorantBenchmark";
import type { BenchmarkLabDocument } from "../domain/benchmarkLab";
import { OrderedInciDisclosure } from "./OrderedInciDisclosure";

interface BenchmarkReferenceSectionProps {
  benchmarkLink: BenchmarkLabDocument["benchmarkLink"];
  onChange: (value: BenchmarkLabDocument["benchmarkLink"]) => void;
}

export function BenchmarkReferenceSection({
  benchmarkLink,
  onChange,
}: BenchmarkReferenceSectionProps) {
  return (
    <section className="panel benchmark-section" id="benchmark">
      <span className="eyebrow">2 / Linked benchmark</span>
      <h2>{benchmarkDeodorantConcept.name}</h2>
      <p>
        Role: inspiration / performance reference · snapshot{" "}
        {benchmarkLink.sourceSnapshotId}
      </p>
      <p>
        No formula, percentage, supplier, procurement, inventory, packaging
        stock, process, lab, or compliance data will be copied.
      </p>
      <OrderedInciDisclosure />
      <label>
        Selection notes
        <textarea
          value={benchmarkLink.notes}
          onChange={(event) =>
            onChange({ ...benchmarkLink, notes: event.target.value })
          }
        />
      </label>
    </section>
  );
}
