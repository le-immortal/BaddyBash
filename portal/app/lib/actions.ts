"use server"

import { signIn, signOut } from "@/auth"

export async function signInAction() {
  await signIn("github", { redirectTo: "/dashboard" })
}

export async function signOutAction() {
  await signOut()
}
