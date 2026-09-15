import { AuditLog, Prisma, PrismaClient } from '@prisma/client';
import prisma from '../shared/prisma';

interface AuditInput {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
}

const auditFor = (client: PrismaClient | Prisma.TransactionClient = prisma) =>
  (input: AuditInput): Promise<AuditLog> =>
    client.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        meta: input.meta as never,
      },
    });

export const audit = auditFor();

export const auditInTx = (tx: Prisma.TransactionClient) => auditFor(tx);
