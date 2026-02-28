import {
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { s3Client } from '../lib/s3';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import type { PhotoType } from '@prisma/client';

export interface UploadPhotoInput {
  ticketId: string;
  uploaderId: string;
  photoType: PhotoType;
  fileBuffer: Buffer;
  mimeType: string;
  originalName: string;
}

export interface PhotoRecord {
  id: string;
  ticketId: string;
  uploaderId: string;
  url: string;
  s3Key: string;
  photoType: PhotoType;
  createdAt: Date;
}

/**
 * Uploads a photo to S3/MinIO and records it in the database.
 */
export async function uploadPhoto(input: UploadPhotoInput): Promise<PhotoRecord> {
  const { ticketId, uploaderId, photoType, fileBuffer, mimeType, originalName } = input;

  // Verify ticket exists
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    throw new Error(`Ticket ${ticketId} not found`);
  }

  // Build S3 key
  const ext = originalName.split('.').pop() ?? 'jpg';
  const s3Key = `tickets/${ticketId}/${photoType}/${uuidv4()}.${ext}`;

  // Upload to S3/MinIO
  await s3Client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: mimeType,
    })
  );

  // Build public URL (MinIO path-style)
  const url = `${env.S3_ENDPOINT}/${env.S3_BUCKET}/${s3Key}`;

  // Persist to DB
  const photo = await prisma.ticketPhoto.create({
    data: {
      ticketId,
      uploaderId,
      url,
      s3Key,
      photoType,
    },
  });

  return photo;
}

/**
 * Generates a pre-signed URL for secure photo access.
 */
export async function getPhotoSignedUrl(s3Key: string, expiresInSeconds = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: s3Key,
  });
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}
