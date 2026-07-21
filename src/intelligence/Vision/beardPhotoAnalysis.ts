export * from '../../../supabase/functions/_shared/beardPhotoAnalysisContract'
import type { BeardPhotoView } from '../../../supabase/functions/_shared/beardPhotoAnalysisContract'
export const BEARD_PHOTO_MAX_BYTES=8*1024*1024;
export const BEARD_PHOTO_MAX_DIMENSION=12_000;
export const BEARD_PHOTO_MAX_PIXELS=40_000_000;
export const allowedBeardPhotoTypes=["image/jpeg","image/png","image/webp"] as const;
export interface SelectedBeardPhoto{view:BeardPhotoView;file:File;previewUrl:string}
export function validateBeardPhotoFile(file:Pick<File,"size"|"type">,maxBytes=BEARD_PHOTO_MAX_BYTES){if(file.size<=0)return"The selected image is empty or corrupt.";if(!(allowedBeardPhotoTypes as readonly string[]).includes(file.type))return"Use a JPEG, PNG, or WebP image.";if(file.size>maxBytes)return`Each image must be ${Math.round(maxBytes/1024/1024)} MB or smaller.`;return null}
export async function canDecodeBeardPhoto(file:File){if(typeof createImageBitmap!=="function")return true;try{const bitmap=await createImageBitmap(file);const valid=bitmap.width>0&&bitmap.height>0&&bitmap.width<=BEARD_PHOTO_MAX_DIMENSION&&bitmap.height<=BEARD_PHOTO_MAX_DIMENSION&&bitmap.width*bitmap.height<=BEARD_PHOTO_MAX_PIXELS;bitmap.close();return valid}catch{return false}}
export const beardPhotoExtension=(type:string)=>type==="image/png"?"png":type==="image/webp"?"webp":"jpg";
