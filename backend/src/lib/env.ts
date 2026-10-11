function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}. See .env.example`);
  return v;
}

export const env = {
  get serviceAccountEmail() {
    return required("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  },
  get privateKey() {
    // Vercel's env UI stores the literal two-character \n sequence; restore real newlines.
    return required("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  },
  get folderId() {
    return required("DRIVE_FOLDER_ID");
  },
  get frameToken() {
    return required("FRAME_TOKEN");
  },
  get adminPassword() {
    return required("ADMIN_PASSWORD");
  },
};
