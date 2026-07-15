import { supabase } from "../supabase/client";

export type DocumentObjectState = "Current" | "Superseded" | "Removed";
export interface StoredDocumentObject {
  id: string;
  documentId: string;
  dossierId: string;
  bucket: string;
  objectPath: string;
  originalFileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploader: string;
  fileVersion: number;
  state: DocumentObjectState;
  checksum?: string;
  removedAt?: string;
}
export interface DocumentStorage {
  upload(
    ownerId: string,
    dossierId: string,
    documentId: string,
    file: File,
  ): Promise<StoredDocumentObject>;
  versions(documentId: string): Promise<StoredDocumentObject[]>;
  download(path: string): Promise<Blob>;
  removeCurrent(documentId: string): Promise<void>;
}

const rowToObject = (row: Record<string, unknown>): StoredDocumentObject => ({
  id: String(row.id),
  documentId: String(row.document_record_id),
  dossierId: String(row.compliance_dossier_id),
  bucket: String(row.bucket),
  objectPath: String(row.object_path),
  originalFileName: String(row.original_file_name),
  mimeType: String(row.mime_type),
  size: Number(row.size),
  uploadedAt: String(row.uploaded_at),
  uploader: String(row.uploader_id ?? row.owner_id),
  fileVersion: Number(row.file_version),
  state: row.state as DocumentObjectState,
  ...(row.checksum ? { checksum: String(row.checksum) } : {}),
  ...(row.removed_at ? { removedAt: String(row.removed_at) } : {}),
});

export class SupabaseDocumentStorage implements DocumentStorage {
  private bucket = "compliance-documents";
  async upload(
    ownerId: string,
    dossierId: string,
    documentId: string,
    file: File,
  ) {
    if (!supabase) throw new Error("Supabase is not configured.");
    const existing = await this.versions(documentId),
      version = Math.max(0, ...existing.map((item) => item.fileVersion)) + 1;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectPath = `${ownerId}/${dossierId}/${documentId}/v${version}/${crypto.randomUUID()}-${safeName}`;
    const uploaded = await supabase.storage
      .from(this.bucket)
      .upload(objectPath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploaded.error) throw uploaded.error;
    const registered = await supabase.rpc("register_document_object", {
      document_id: documentId,
      dossier_id: dossierId,
      object_bucket: this.bucket,
      path: objectPath,
      file_name: file.name,
      content_type: file.type || "application/octet-stream",
      byte_size: file.size,
      content_checksum: undefined,
    });
    if (registered.error) {
      await supabase.storage.from(this.bucket).remove([objectPath]);
      throw registered.error;
    }
    return rowToObject(registered.data as unknown as Record<string, unknown>);
  }
  async versions(documentId: string) {
    if (!supabase) throw new Error("Supabase is not configured.");
    const result = await supabase
      .from("document_objects")
      .select("*")
      .eq("document_record_id", documentId)
      .order("file_version", { ascending: false });
    if (result.error) throw result.error;
    return (result.data as unknown as Record<string, unknown>[]).map(
      rowToObject,
    );
  }
  async download(path: string) {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .download(path);
    if (error) throw error;
    return data;
  }
  async removeCurrent(documentId: string) {
    if (!supabase) throw new Error("Supabase is not configured.");
    const current = (await this.versions(documentId)).find(
      (item) => item.state === "Current",
    );
    if (!current) throw new Error("No current file is attached.");
    const metadata = await supabase.rpc("remove_current_document_object", {
      document_id: documentId,
    });
    if (metadata.error) throw metadata.error;
    const removed = await supabase.storage
      .from(this.bucket)
      .remove([current.objectPath]);
    if (removed.error)
      throw new Error(
        `File metadata was safely marked Removed, but Storage cleanup failed: ${removed.error.message}`,
      );
  }
}
