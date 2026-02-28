import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import type { PhotoType } from '@prisma/client';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

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
 * Uploads a photo to Cloudinary and records it in the database.
 * s3Key stores the Cloudinary public_id for future management.
 */
export async function uploadPhoto(input: UploadPhotoInput): Promise<PhotoRecord> {
  const { ticketId, uploaderId, photoType, fileBuffer } = input;

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    throw new Error(`Ticket ${ticketId} not found`);
  }

  const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: `tickets/${ticketId}/${photoType}`, resource_type: 'image' },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Upload failed'));
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    ).end(fileBuffer);
  });

  const photo = await prisma.ticketPhoto.create({
    data: {
      ticketId,
      uploaderId,
      url: result.secure_url,
      s3Key: result.public_id,
      photoType,
    },
  });

  return photo;
}

/**
 * Returns the Cloudinary URL for a photo (already public, no signing needed).
 */
export async function getPhotoSignedUrl(publicId: string): Promise<string> {
  return cloudinary.url(publicId, { secure: true });
}
