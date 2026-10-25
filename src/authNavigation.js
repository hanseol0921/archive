let signingOut = false;
export const isSigningOut = () => signingOut;
export async function signOutToPage(auth, navigate) {
  signingOut = true;
  try {
    const { error } = await auth.signOut();
    if (error) throw error;
    navigate('/logout');
  } catch (error) {
    signingOut = false;
    throw error;
  }
}
