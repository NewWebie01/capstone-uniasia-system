import jwt from "jsonwebtoken";

export type AuthPayload = {
  email: string;
  role: string;
};

export function verifyToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    if (typeof decoded === "string") return null;
    const email = (decoded as any)?.email;
    const role = (decoded as any)?.role;
    if (!email || !role) return null;
    return { email, role };
  } catch {
    return null;
  }
}
