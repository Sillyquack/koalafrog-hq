import {
  benchmarkDeclarationNote,
  benchmarkDeodorantInci,
} from "../domain/deodorantBenchmark";

export function OrderedInciDisclosure() {
  return (
    <details className="ordered-inci-disclosure">
      <summary>View exact ordered label declaration</summary>
      <div>
        <p>{benchmarkDeclarationNote}</p>
        <p>
          Percentages remain Unknown. This reference creates no Formula Lines.
          Declared fragrance constituents remain separate from core or functional
          ingredients.
        </p>
        <ol>
          {benchmarkDeodorantInci.map((line) => (
            <li key={line.order}>
              <span className="inci-order">{line.order}</span>
              <span>
                <strong>{line.displayedName}</strong>
                <small>
                  Canonical INCI: {line.canonicalInci}
                  {line.displayedAlias
                    ? ` · displayed alias: ${line.displayedAlias}`
                    : ""}
                </small>
                <small>
                  {line.classification === "declared_fragrance_constituent"
                    ? "Declared fragrance constituent"
                    : "Core or functional declaration"}
                </small>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
