import * as ImagePicker from 'expo-image-picker';
import { supabaseAdmin } from './supabase';

/**
 * Prompt user to pick an image from gallery or take photo with camera.
 */
export async function pickImage(fromCamera: boolean = false): Promise<string | null> {
  try {
    if (fromCamera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        alert('Camera permission is required to take photo proof.');
        return null;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        return result.assets[0].uri;
      }
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        alert('Media library permission is required to choose photo proof.');
        return null;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        return result.assets[0].uri;
      }
    }
  } catch (err) {
    console.warn('Error picking image:', err);
  }
  return null;
}

/**
 * Safely extracts file extension, handling web blob: URIs and query parameters.
 */
function getFileExtension(uri: string): string {
  if (uri.startsWith('blob:') || uri.startsWith('data:')) {
    return 'jpg';
  }
  const cleanUri = uri.split('?')[0];
  const parts = cleanUri.split('.');
  const candidate = parts.pop()?.toLowerCase() || 'jpg';
  if (candidate.length <= 4 && /^[a-z0-9]+$/.test(candidate)) {
    return candidate;
  }
  return 'jpg';
}

/**
 * Uploads a local image URI to Supabase Storage bucket 'task-photos'
 * using supabaseAdmin to bypass storage RLS and returns the public URL.
 */
export async function uploadTaskPhoto(localUri: string): Promise<string | null> {
  try {
    const ext = getFileExtension(localUri);
    const fileName = `proof-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

    const response = await fetch(localUri);
    const blob = await response.blob();

    const { data, error } = await supabaseAdmin.storage
      .from('task-photos')
      .upload(fileName, blob, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.warn('Supabase storage upload error:', error.message);
      return null;
    }

    const { data: pubData } = supabaseAdmin.storage
      .from('task-photos')
      .getPublicUrl(data.path);

    return pubData.publicUrl;
  } catch (err) {
    console.warn('Failed to upload task photo:', err);
    return null;
  }
}
