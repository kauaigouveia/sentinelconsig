const fs = require('fs');
const content = `
  // ==========================================
  // ANNOUNCEMENTS
  // ==========================================

  const getVisibilityWhere = () => {
    const now = new Date();
    return {
      status: 'PUBLISHED',
      publishedAt: { lte: now },
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: now } }
      ]
    };
  };

  app.post('/api/announcements', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      
      const { role, tenantId: userTenantId, id: userId } = session.user;
      
      let { title, content, priority, scheduledAt, expiresAt, isGlobal } = req.body;
      let targetTenantId = userTenantId;

      if (role === 'PLATFORM_MASTER') {
        if (isGlobal) {
          targetTenantId = null;
        }
      } else if (role === 'MASTER') {
        if (isGlobal) {
          return res.status(403).json({ error: 'Apenas PLATFORM_MASTER pode criar comunicados globais.' });
        }
      } else {
        return res.status(403).json({ error: 'Acesso negado para criação de comunicados.' });
      }

      const announcement = await prisma.announcement.create({
        data: {
          title,
          content,
          priority: priority || 'MEDIUM',
          tenantId: targetTenantId,
          createdById: userId,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        }
      });

      await prisma.auditLog.create({
        data: {
          tenantId: targetTenantId,
          userId,
          action: 'announcement.created',
          entity: 'Announcement',
          entityId: announcement.id,
        }
      });

      res.json(announcement);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao criar comunicado.' });
    }
  });

  app.get('/api/announcements/manage', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { role, tenantId: userTenantId } = session.user;

      if (role !== 'PLATFORM_MASTER' && role !== 'MASTER') {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      const whereClause = role === 'PLATFORM_MASTER' 
        ? {} 
        : { tenantId: userTenantId };

      const announcements = await prisma.announcement.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' }
      });
      res.json(announcements);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao listar comunicados.' });
    }
  });

  app.get('/api/announcements', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { tenantId, id: userId } = session.user;

      const limit = Number(req.query.limit) || 20;
      const cursor = req.query.cursor ? String(req.query.cursor) : undefined;

      const announcements = await prisma.announcement.findMany({
        where: {
          OR: [
            { tenantId: null },
            { tenantId }
          ],
          ...getVisibilityWhere()
        },
        orderBy: [
          { priority: 'desc' },
          { publishedAt: 'desc' }
        ],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor } } : {}),
        include: {
          reads: {
            where: { userId }
          }
        }
      });

      let nextCursor = undefined;
      if (announcements.length > limit) {
        const nextItem = announcements.pop();
        nextCursor = nextItem?.id;
      }

      const formatted = announcements.map(a => {
        const readRecord = a.reads[0];
        return {
          ...a,
          read: !!readRecord?.readAt,
          dismissed: !!readRecord?.dismissedAt,
          reads: undefined
        };
      }).filter(a => !a.dismissed); // Do not show dismissed ones in the main feed

      res.json({ data: formatted, nextCursor, hasMore: !!nextCursor });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao listar comunicados do usuário.' });
    }
  });

  app.get('/api/announcements/unread-count', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { tenantId, id: userId } = session.user;

      // Unread count: All visible announcements that don't have a read record for this user
      // Note: Since Prisma doesn't support left join IS NULL easily in count with relations,
      // we can fetch the IDs or do a small query. Assuming low volume of announcements per tenant:
      
      const visibleAnnouncements = await prisma.announcement.findMany({
        where: {
          OR: [
            { tenantId: null },
            { tenantId }
          ],
          ...getVisibilityWhere()
        },
        select: { id: true }
      });
      
      if (visibleAnnouncements.length === 0) {
        return res.json({ count: 0 });
      }

      const readRecords = await prisma.announcementRead.count({
        where: {
          userId,
          announcementId: { in: visibleAnnouncements.map(a => a.id) },
          readAt: { not: null }
        }
      });

      const count = visibleAnnouncements.length - readRecords;
      res.json({ count });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao contar comunicados.' });
    }
  });

  app.get('/api/announcements/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      
      const { role, tenantId: userTenantId } = session.user;
      
      const announcement = await prisma.announcement.findUnique({
        where: { id: req.params.id }
      });
      
      if (!announcement) return res.status(404).json({ error: 'Não encontrado.' });

      if (role !== 'PLATFORM_MASTER' && role !== 'MASTER') {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      if (role === 'MASTER' && announcement.tenantId !== userTenantId) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      res.json(announcement);
    } catch (err) {
      res.status(500).json({ error: 'Erro ao buscar.' });
    }
  });

  app.put('/api/announcements/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      
      const { role, tenantId: userTenantId, id: userId } = session.user;
      const { title, content, priority, scheduledAt, expiresAt } = req.body;
      
      const announcement = await prisma.announcement.findUnique({
        where: { id: req.params.id }
      });
      if (!announcement) return res.status(404).json({ error: 'Não encontrado.' });

      if (role === 'MASTER' && announcement.tenantId !== userTenantId) {
        return res.status(403).json({ error: 'Acesso negado.' });
      }
      if (role !== 'PLATFORM_MASTER' && role !== 'MASTER') {
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      const updated = await prisma.announcement.update({
        where: { id: req.params.id },
        data: {
          title,
          content,
          priority,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        }
      });

      await prisma.auditLog.create({
        data: {
          tenantId: announcement.tenantId,
          userId,
          action: 'announcement.updated',
          entity: 'Announcement',
          entityId: announcement.id,
        }
      });
      
      if (updated.status === 'PUBLISHED') {
         if (global.pusher) {
           const channel = updated.tenantId ? \`private-tenant-\${updated.tenantId}\` : 'private-platform-global';
           global.pusher.trigger(channel, 'announcement-updated', { entityId: updated.id, type: 'ANNOUNCEMENT_UPDATED' }).catch(() => {});
         }
      }

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Erro ao atualizar.' });
    }
  });

  app.post('/api/announcements/:id/publish', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { role, tenantId: userTenantId, id: userId } = session.user;
      
      const announcement = await prisma.announcement.findUnique({ where: { id: req.params.id } });
      if (!announcement) return res.status(404).json({ error: 'Não encontrado.' });

      if (role === 'MASTER' && announcement.tenantId !== userTenantId) return res.status(403).json({ error: 'Acesso negado.' });
      if (role !== 'PLATFORM_MASTER' && role !== 'MASTER') return res.status(403).json({ error: 'Acesso negado.' });

      const updated = await prisma.announcement.update({
        where: { id: announcement.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date()
        }
      });

      await prisma.auditLog.create({
        data: { tenantId: announcement.tenantId, userId, action: 'announcement.published', entity: 'Announcement', entityId: announcement.id }
      });

      if (global.pusher) {
         const channel = updated.tenantId ? \`private-tenant-\${updated.tenantId}\` : 'private-platform-global';
         global.pusher.trigger(channel, 'announcement-published', { entityId: updated.id, type: 'ANNOUNCEMENT_PUBLISHED' }).catch(() => {});
      }

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Erro ao publicar.' });
    }
  });

  app.post('/api/announcements/:id/cancel', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { role, tenantId: userTenantId, id: userId } = session.user;
      
      const announcement = await prisma.announcement.findUnique({ where: { id: req.params.id } });
      if (!announcement) return res.status(404).json({ error: 'Não encontrado.' });

      if (role === 'MASTER' && announcement.tenantId !== userTenantId) return res.status(403).json({ error: 'Acesso negado.' });
      if (role !== 'PLATFORM_MASTER' && role !== 'MASTER') return res.status(403).json({ error: 'Acesso negado.' });

      const updated = await prisma.announcement.update({
        where: { id: announcement.id },
        data: { status: 'CANCELLED' }
      });

      await prisma.auditLog.create({
        data: { tenantId: announcement.tenantId, userId, action: 'announcement.cancelled', entity: 'Announcement', entityId: announcement.id }
      });

      if (global.pusher) {
         const channel = updated.tenantId ? \`private-tenant-\${updated.tenantId}\` : 'private-platform-global';
         global.pusher.trigger(channel, 'announcement-cancelled', { entityId: updated.id, type: 'ANNOUNCEMENT_CANCELLED' }).catch(() => {});
      }

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Erro ao cancelar.' });
    }
  });

  app.post('/api/announcements/:id/archive', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { role, tenantId: userTenantId, id: userId } = session.user;
      
      const announcement = await prisma.announcement.findUnique({ where: { id: req.params.id } });
      if (!announcement) return res.status(404).json({ error: 'Não encontrado.' });

      if (role === 'MASTER' && announcement.tenantId !== userTenantId) return res.status(403).json({ error: 'Acesso negado.' });
      if (role !== 'PLATFORM_MASTER' && role !== 'MASTER') return res.status(403).json({ error: 'Acesso negado.' });

      const updated = await prisma.announcement.update({
        where: { id: announcement.id },
        data: { status: 'ARCHIVED' }
      });

      await prisma.auditLog.create({
        data: { tenantId: announcement.tenantId, userId, action: 'announcement.archived', entity: 'Announcement', entityId: announcement.id }
      });
      
      if (global.pusher) {
         const channel = updated.tenantId ? \`private-tenant-\${updated.tenantId}\` : 'private-platform-global';
         global.pusher.trigger(channel, 'announcement-archived', { entityId: updated.id, type: 'ANNOUNCEMENT_ARCHIVED' }).catch(() => {});
      }

      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'Erro ao arquivar.' });
    }
  });

  app.delete('/api/announcements/:id', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { role, tenantId: userTenantId, id: userId } = session.user;
      
      const announcement = await prisma.announcement.findUnique({ where: { id: req.params.id } });
      if (!announcement) return res.status(404).json({ error: 'Não encontrado.' });

      if (role === 'MASTER' && announcement.tenantId !== userTenantId) return res.status(403).json({ error: 'Acesso negado.' });
      if (role !== 'PLATFORM_MASTER' && role !== 'MASTER') return res.status(403).json({ error: 'Acesso negado.' });

      await prisma.announcement.delete({ where: { id: announcement.id } });

      await prisma.auditLog.create({
        data: { tenantId: announcement.tenantId, userId, action: 'announcement.deleted', entity: 'Announcement', entityId: announcement.id }
      });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Erro ao excluir.' });
    }
  });

  app.post('/api/announcements/:id/read', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { tenantId, id: userId } = session.user;
      
      const announcement = await prisma.announcement.findFirst({ 
        where: { 
          id: req.params.id,
          OR: [{ tenantId: null }, { tenantId }],
          ...getVisibilityWhere()
        } 
      });

      if (!announcement) return res.status(404).json({ error: 'Não encontrado ou invisível.' });

      await prisma.announcementRead.upsert({
        where: {
          announcementId_userId: {
            announcementId: announcement.id,
            userId
          }
        },
        update: {
          readAt: new Date()
        },
        create: {
          announcementId: announcement.id,
          userId,
          readAt: new Date()
        }
      });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Erro ao marcar como lido.' });
    }
  });

  app.post('/api/announcements/:id/dismiss', async (req, res) => {
    try {
      const session = await getAuthSession(req);
      if (!session || !session.user) return res.status(401).json({ error: 'Não autenticado.' });
      const { tenantId, id: userId } = session.user;
      
      const announcement = await prisma.announcement.findFirst({ 
        where: { 
          id: req.params.id,
          OR: [{ tenantId: null }, { tenantId }],
          ...getVisibilityWhere()
        } 
      });

      if (!announcement) return res.status(404).json({ error: 'Não encontrado ou invisível.' });

      await prisma.announcementRead.upsert({
        where: {
          announcementId_userId: {
            announcementId: announcement.id,
            userId
          }
        },
        update: {
          readAt: new Date(),
          dismissedAt: new Date()
        },
        create: {
          announcementId: announcement.id,
          userId,
          readAt: new Date(),
          dismissedAt: new Date()
        }
      });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Erro ao dispensar comunicado.' });
    }
  });

`;

const serverPath = 'server.ts';
let serverStr = fs.readFileSync(serverPath, 'utf8');

const targetStr = "if (process.env.NODE_ENV !== 'production') {";
const index = serverStr.indexOf(targetStr);

if (index !== -1) {
  serverStr = serverStr.slice(0, index) + content + '\n  ' + serverStr.slice(index);
  fs.writeFileSync(serverPath, serverStr);
  console.log('Routes injected successfully');
} else {
  console.log('Could not find injection point');
}
