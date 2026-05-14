import { v2 as cloudinary } from 'cloudinary';

export type CloudinaryUploadResult = {
  secure_url: string;
  public_id: string;
};

export function configureCloudinaryFromEnv(env: {
  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;
}): void {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export async function uploadImageBufferToCloudinary(args: {
  buffer: Buffer;
  folder: string;
  publicId: string;
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
}): Promise<CloudinaryUploadResult> {
  const dataUri = `data:${args.mime};base64,${args.buffer.toString('base64')}`;
  const res = await cloudinary.uploader.upload(dataUri, {
    folder: args.folder.replace(/\/+$/, ''),
    public_id: args.publicId,
    overwrite: false,
    resource_type: 'image',
    invalidate: true,
  });
  if (!res.secure_url || !res.public_id) {
    throw new Error('Cloudinary upload returned an unexpected payload');
  }
  return { secure_url: res.secure_url, public_id: res.public_id };
}

export async function destroyCloudinaryImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId, {
    resource_type: 'image',
    invalidate: true,
  });
}
