const fs = require('fs');
let content = fs.readFileSync('src/services/storageService.ts', 'utf8');

// Empty INITIAL_ACHIEVEMENTS
const initialAchievementsRegex = /const INITIAL_ACHIEVEMENTS: GamificationAchievement\[\] = \[[\s\S]*?\];/;
content = content.replace(initialAchievementsRegex, 'const INITIAL_ACHIEVEMENTS: GamificationAchievement[] = [];');

// Update getAchievements
const oldGetAchievements = `  public static getAchievements(): GamificationAchievement[] {
    return this.get<GamificationAchievement[]>(STORAGE_KEYS.ACHIEVEMENTS, INITIAL_ACHIEVEMENTS);
  }`;

const newGetAchievements = `  public static getAchievements(): GamificationAchievement[] {
    const raw = this.get<GamificationAchievement[]>(STORAGE_KEYS.ACHIEVEMENTS, INITIAL_ACHIEVEMENTS);
    const validUsers = this.getUsers();
    
    return raw.map(ach => {
      const user = validUsers.find(u => u.id === ach.operatorId);
      if (user) {
        return { ...ach, operatorName: user.name };
      }
      return { ...ach, operatorName: 'Sem responsável' };
    });
  }`;

content = content.replace(oldGetAchievements, newGetAchievements);
fs.writeFileSync('src/services/storageService.ts', content);
