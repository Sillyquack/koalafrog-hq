import { useEffect, useMemo, useState } from "react";
import { Download, FilePlus2, Trash2, Upload } from "lucide-react";
import { SectionHeader } from "../../../components/ui/SectionHeader";
import { useFormulaData } from "../../formulas/state/FormulaDataContext";
import {
  SupabaseDocumentStorage,
  type StoredDocumentObject,
} from "../../../platform/storage/documentStorage";
import { supabase } from "../../../platform/supabase/client";

export function ComplianceDocumentsPanel({ dossierId }: { dossierId: string }) {
  const data = useFormulaData(),
    storage = useMemo(() => new SupabaseDocumentStorage(), []),
    documents = useMemo(()=>data.complianceDocuments.filter(
      (document) =>
        document.linkedEntityType === "ComplianceDossier" &&
        document.linkedEntityId === dossierId,
    ),[data.complianceDocuments,dossierId]);
  const [versions, setVersions] = useState<
      Record<string, StoredDocumentObject[]>
    >({}),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all(
      documents.map(
        async (document) =>
          [document.id, await storage.versions(document.id)] as const,
      ),
    )
      .then((entries) => {
        if (active) setVersions(Object.fromEntries(entries));
      })
      .catch(
        (error) =>
          active &&
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not load document files.",
          ),
      );
    return () => {
      active = false;
    };
  }, [documents, storage]);
  const create = () => {
    const title = window.prompt("Compliance document title");
    if (!title) return;
    data.createComplianceDocument({
      documentType: "Supporting Evidence",
      title,
      version: "v1",
      status: "Draft",
      linkedEntityType: "ComplianceDossier",
      linkedEntityId: dossierId,
      issuedBy: "",
      author: "Owner",
      notes: "",
    });
  };
  const upload = async (documentId: string, file: File) => {
    setPending(documentId);
    setMessage("");
    try {
      const auth = await supabase?.auth.getUser(),
        owner = auth?.data.user?.id;
      if (!owner) throw new Error("Sign in before uploading.");
      const saved = await storage.upload(owner, dossierId, documentId, file);
      data.updateComplianceDocument(documentId, {
        fileName: saved.originalFileName,
        version: `v${saved.fileVersion}`,
      });
      setVersions((current) => ({
        ...current,
        [documentId]: [
          saved,
          ...(current[documentId] ?? []).map((item) =>
            item.state === "Current" ? { ...item, state: "Superseded" as const } : item,
          ),
        ],
      }));
      setMessage("Private document file uploaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setPending("");
    }
  };
  const open = async (path: string) => {
    try {
      const blob = await storage.download(path),
        url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download failed.");
    }
  };
  const remove = async (documentId: string) => {
    if (
      !window.confirm(
        "Remove the active file? Historical file metadata remains recorded.",
      )
    )
      return;
    setPending(documentId);
    try {
      await storage.removeCurrent(documentId);
      data.updateComplianceDocument(documentId, { fileName: "" });
      setVersions((current) => ({
        ...current,
        [documentId]: (current[documentId] ?? []).map((item) =>
          item.state === "Current"
            ? { ...item, state: "Removed", removedAt: new Date().toISOString() }
            : item,
        ),
      }));
      setMessage("Active file removed; historical metadata retained.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Removal failed.");
    } finally {
      setPending("");
    }
  };
  return (
    <section className="panel compliance-documents">
      <SectionHeader
        title="Compliance Documents"
        detail="Private owner-isolated files; metadata may exist without an attachment"
        action={
          <button className="text-button" onClick={create}>
            <FilePlus2 size={14} />
            Create metadata record
          </button>
        }
      />
      {message && (
        <p
          className={
            message.includes("uploaded") || message.includes("removed")
              ? "success-message"
              : "form-error"
          }
          role="status"
        >
          {message}
        </p>
      )}
      <div className="document-list">
        {documents.map((document) => {
          const history = versions[document.id] ?? [],
            current = history.find((item) => item.state === "Current");
          return (
            <article key={document.id} className="evidence-row">
              <div>
                <strong>{document.title}</strong>
                <p>
                  {current
                    ? `${current.originalFileName} · ${current.mimeType} · ${current.size} bytes · uploaded ${new Date(current.uploadedAt).toLocaleString("en-GB")}`
                    : "No file attached"}
                </p>
                <small>
                  {history.length
                    ? `${history.length} recorded file version${history.length === 1 ? "" : "s"}`
                    : "Metadata only"}
                </small>
              </div>
              <div className="action-row">
                {current && (
                  <>
                    <button
                      className="button ghost"
                      onClick={() => open(current.objectPath)}
                    >
                      <Download size={14} />
                      Open
                    </button>
                    <button
                      className="button ghost"
                      disabled={pending === document.id}
                      onClick={() => remove(document.id)}
                    >
                      <Trash2 size={14} />
                      Remove file
                    </button>
                  </>
                )}
                <label className="button ghost">
                  <Upload size={14} />
                  {current ? "Upload New File Version" : "Attach File"}
                  <input
                    hidden
                    type="file"
                    disabled={pending === document.id}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void upload(document.id, file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            </article>
          );
        })}
        {!documents.length && (
          <p className="empty-copy">No Compliance Document metadata records.</p>
        )}
      </div>
    </section>
  );
}
