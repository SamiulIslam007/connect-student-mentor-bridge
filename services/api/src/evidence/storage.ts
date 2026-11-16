import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** A download link lives five minutes (design R3). */
export const EVIDENCE_URL_TTL_SECONDS = 300;

export interface EvidenceStorageConfig {
  endpoint: string;
  /** The host a browser can reach; signing against the container host is unusable. */
  publicEndpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/** The only thing the routes and the jobs touch; nothing imports the SDK directly. */
export interface EvidenceStorage {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  presignGet(key: string): Promise<string>;
}

/**
 * `null` means this deployment carries no object store (design R8): the routes
 * answer `503 EVIDENCE_UNAVAILABLE` and the scan job does nothing. Failing the
 * API's boot instead would take auth and outcomes down with an optional feature.
 */
export function evidenceStorageConfig(
  env: NodeJS.ProcessEnv = process.env,
): EvidenceStorageConfig | null {
  const endpoint = env.S3_ENDPOINT?.trim();
  const bucket = env.S3_BUCKET?.trim();
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }
  return {
    endpoint,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT?.trim() || endpoint,
    region: env.S3_REGION?.trim() || "us-east-1",
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: (env.S3_FORCE_PATH_STYLE?.trim() ?? "true") !== "false",
  };
}

async function bodyBytes(body: unknown): Promise<Buffer> {
  const stream = body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  if (!stream?.transformToByteArray) {
    throw new Error("the object store returned no readable body");
  }
  return Buffer.from(await stream.transformToByteArray());
}

export class S3EvidenceStorage implements EvidenceStorage {
  private readonly client: S3Client;
  private readonly signingClient: S3Client;

  /**
   * The clients are constructor options so a unit test can pass a fake one; the
   * real ones differ only in endpoint (design R3).
   */
  constructor(
    private readonly config: EvidenceStorageConfig,
    clients: { client?: S3Client; signingClient?: S3Client } = {},
  ) {
    const common = {
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    };
    this.client = clients.client ?? new S3Client({ ...common, endpoint: config.endpoint });
    this.signingClient =
      clients.signingClient ?? new S3Client({ ...common, endpoint: config.publicEndpoint });
  }

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        ContentLength: bytes.length,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    return bodyBytes(response.Body);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  async presignGet(key: string): Promise<string> {
    return getSignedUrl(this.signingClient, new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    }), { expiresIn: EVIDENCE_URL_TTL_SECONDS });
  }
}

export function createEvidenceStorage(
  env: NodeJS.ProcessEnv = process.env,
): EvidenceStorage | null {
  const config = evidenceStorageConfig(env);
  return config ? new S3EvidenceStorage(config) : null;
}
