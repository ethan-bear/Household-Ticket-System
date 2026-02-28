import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import type { PhotoType } from '@prisma/client';

const cloudinaryConfigured =
  env.CLOUDINARY_CLOUD_NAME !== '' &&
  env.CLOUDINARY_API_KEY !== '' &&
  env.CLOUDINARY_API_SECRET !== '';

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
}

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
 * Uploads a photo. Uses Cloudinary when configured; otherwise stores
 * the image as a base64 data URL directly in the database.
 */
export async function uploadPhoto(input: UploadPhotoInput): Promise<PhotoRecord> {
  const { ticketId, uploaderId, photoType, fileBuffer, mimeType } = input;

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    throw new Error(`Ticket ${ticketId} not found`);
  }

  let url: string;
  let s3Key: string;

  if (cloudinaryConfigured) {
    const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: `tickets/${ticketId}/${photoType}`, resource_type: 'image' },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Upload failed'));
          resolve({ secure_url: result.secure_url, public_id: result.public_id });
        }
      ).end(fileBuffer);
    });
    url = result.secure_url;
    s3Key = result.public_id;
  } else {
    // Fallback: store as base64 data URL
    const b64 = fileBuffer.toString('base64');
    url = `data:${mimeType};base64,${b64}`;
    s3Key = '';
  }

  const photo = await prisma.ticketPhoto.create({
    data: { ticketId, uploaderId, url, s3Key, photoType },
  });

  return photo;
}

/**
 * Returns the URL for a photo. For Cloudinary-hosted photos, reconstructs
 * the URL from the public_id; for base64 photos, returns the stored data URL.
 */
export async function getPhotoSignedUrl(publicId: string): Promise<string> {
  if (!publicId || !cloudinaryConfigured) return publicId;
  return cloudinary.url(publicId, { secure: true });
}
