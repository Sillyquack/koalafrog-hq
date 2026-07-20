interface UnsavedBenchmarkLabChangesModalProps {
  onStay: () => void;
  onDiscard: () => void;
}

export function UnsavedBenchmarkLabChangesModal({
  onStay,
  onDiscard,
}: UnsavedBenchmarkLabChangesModalProps) {
  return (
    <div className="modal-backdrop">
      <div className="workspace-modal" role="dialog" aria-modal="true">
        <h2>Unsaved Benchmark Lab changes</h2>
        <p>Leave and discard changes, or stay and save first.</p>
        <footer>
          <button className="button" onClick={onStay}>
            Stay
          </button>
          <button className="button danger" onClick={onDiscard}>
            Discard and leave
          </button>
        </footer>
      </div>
    </div>
  );
}
