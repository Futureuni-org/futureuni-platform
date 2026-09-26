// Violation: the Prisma client outside src/platform/db, prisma/ and *.repo.ts.
import { Prisma } from "@prisma/client";

export const prismaVersion = Prisma.prismaVersion;
