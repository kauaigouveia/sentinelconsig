const fs = require('fs');
const schemaStr = fs.readFileSync('prisma/schema.prisma', 'utf8');

const updatedStr = schemaStr.replace('  statusHistories   StatusHistory[]', '  statusHistories   StatusHistory[]\n  createdAnnouncements Announcement[] @relation("CreatedAnnouncements")\n  readAnnouncements   AnnouncementRead[] @relation("ReadAnnouncements")');

fs.writeFileSync('prisma/schema.prisma', updatedStr);
