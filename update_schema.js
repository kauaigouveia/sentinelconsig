const fs = require('fs');
const schemaStr = fs.readFileSync('prisma/schema.prisma', 'utf8');

const newModels = `
enum AnnouncementStatus {
  DRAFT
  SCHEDULED
  PUBLISHED
  EXPIRED
  ARCHIVED
  CANCELLED
}

model Announcement {
  id              String             @id @default(cuid())
  tenantId        String?            @map("tenant_id")
  tenant          Tenant?            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  createdById     String             @map("created_by_id")
  createdBy       User               @relation("CreatedAnnouncements", fields: [createdById], references: [id])
  title           String
  content         String
  priority        PriorityLevel      @default(MEDIUM)
  status          AnnouncementStatus @default(DRAFT)
  publishedAt     DateTime?          @map("published_at")
  scheduledAt     DateTime?          @map("scheduled_at")
  expiresAt       DateTime?          @map("expires_at")
  createdAt       DateTime           @default(now()) @map("created_at")
  updatedAt       DateTime           @updatedAt @map("updated_at")

  reads           AnnouncementRead[]

  @@index([tenantId])
  @@index([status])
  @@index([publishedAt])
  @@index([expiresAt])
  @@map("announcements")
}

model AnnouncementRead {
  id             String       @id @default(cuid())
  announcementId String       @map("announcement_id")
  announcement   Announcement @relation(fields: [announcementId], references: [id], onDelete: Cascade)
  userId         String       @map("user_id")
  user           User         @relation("ReadAnnouncements", fields: [userId], references: [id], onDelete: Cascade)
  readAt         DateTime?    @default(now()) @map("read_at")
  dismissedAt    DateTime?    @map("dismissed_at")

  @@unique([announcementId, userId])
  @@index([userId])
  @@map("announcement_reads")
}
`;

const updatedStr = schemaStr.replace('// ==========================================\n// TASKS, FINANCIAL & NOTIFICATIONS', newModels + '\n// ==========================================\n// TASKS, FINANCIAL & NOTIFICATIONS');

fs.writeFileSync('prisma/schema.prisma', updatedStr);
