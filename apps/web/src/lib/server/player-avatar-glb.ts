import "server-only";

const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;

interface GlbResource {
  readonly uri?: unknown;
}

interface GlbJson {
  readonly asset?: { readonly version?: unknown };
  readonly buffers?: readonly GlbResource[];
  readonly images?: readonly GlbResource[];
}

export function validateSelfContainedGlb(buffer: ArrayBuffer, maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 20 || buffer.byteLength > maxBytes) {
    throw new Error("Avatar-GLB:n är för stor.");
  }
  if (buffer.byteLength < GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES) {
    throw new Error("Avatarfilen är inte en giltig GLB.");
  }
  const view = new DataView(buffer);
  const jsonLength = view.getUint32(GLB_HEADER_BYTES, true);
  const jsonStart = GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES;
  const jsonEnd = jsonStart + jsonLength;
  if (
    view.getUint32(0, true) !== GLB_MAGIC
    || view.getUint32(4, true) !== GLB_VERSION
    || view.getUint32(8, true) !== buffer.byteLength
    || view.getUint32(GLB_HEADER_BYTES + 4, true) !== JSON_CHUNK_TYPE
    || jsonLength === 0
    || jsonEnd > buffer.byteLength
  ) {
    throw new Error("Avatarfilen är inte en giltig GLB 2.0.");
  }

  let json: GlbJson;
  try {
    const text = new TextDecoder()
      .decode(new Uint8Array(buffer, jsonStart, jsonLength))
      .replaceAll(/\u0000|\s+$/g, "");
    json = JSON.parse(text) as GlbJson;
  } catch {
    throw new Error("Avatar-GLB:ns metadata är ogiltig.");
  }
  if (json.asset?.version !== "2.0") throw new Error("Avatar-GLB:n saknar glTF 2.0-metadata.");
  assertEmbedded(json.buffers);
  assertEmbedded(json.images);
}

function assertEmbedded(resources: readonly GlbResource[] | undefined): void {
  for (const resource of resources ?? []) {
    if (typeof resource.uri === "string" && !resource.uri.startsWith("data:")) {
      throw new Error("Avatar-GLB:n får inte hämta externa resurser.");
    }
  }
}
