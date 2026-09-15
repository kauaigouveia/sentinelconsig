const fs = require('fs');
const schemaStr = fs.readFileSync('prisma/schema.prisma', 'utf8');

const updatedStr = schemaStr.replace('  notifications   Notification[]', '  notifications   Notification[]\n  announcements   Announcement[]');

fs.writeFileSync('prisma/schema.prisma', updatedStr);
