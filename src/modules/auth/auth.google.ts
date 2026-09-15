import { env } from '../../config/env';
import { ApiError } from '../../shared/catchAsync';

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}

/**
 * Verifies a Google ID token (the `credential` from Google Identity Services)
 * against Google's tokeninfo endpoint and returns the profile.
 */
export const verifyGoogleToken = async (credential: string): Promise<GoogleProfile> => {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
  );

  if (!res.ok) {
    throw ApiError.unauthorized('Invalid Google credential');
  }

  const data = (await res.json()) as {
    sub?: string;
    aud?: string;
    email?: string;
    email_verified?: string;
    name?: string;
    picture?: string;
  };

  if (!data.sub || !data.email) {
    throw ApiError.unauthorized('Invalid Google credential');
  }

  if (env.GOOGLE_CLIENT_ID && data.aud !== env.GOOGLE_CLIENT_ID) {
    throw ApiError.unauthorized('Google credential was issued for a different client');
  }

  if (data.email_verified === 'false') {
    throw ApiError.unauthorized('Google account email is not verified');
  }

  return {
    googleId: data.sub,
    email: data.email.toLowerCase(),
    name: data.name || data.email.split('@')[0],
    picture: data.picture,
  };
};
