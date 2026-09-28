require('dotenv').config();
const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('setup-panel')
    .setDescription('إعداد لوحة بدء الاختبار (للإدارة فقط)')
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('الروم اللي بيظهر فيه زر ابدأ الاختبار')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addChannelOption((o) =>
      o
        .setName('log-channel')
        .setDescription('روم سجل نتائج الاختبار (للإدارة)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addRoleOption((o) =>
      o.setName('pass-role').setDescription('الرتبة اللي تنعطى عند النجاح').setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName('threshold')
        .setDescription('نسبة النجاح المطلوبة % (افتراضي 80)')
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addIntegerOption((o) =>
      o
        .setName('question-count')
        .setDescription('عدد الأسئلة اللي تجي بكل محاولة (افتراضي 7)')
        .setMinValue(1)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('add-question')
    .setDescription('إضافة سؤال صح/خطأ لبنك الأسئلة (للإدارة فقط)')
    .addStringOption((o) => o.setName('question').setDescription('نص السؤال').setRequired(true))
    .addStringOption((o) =>
      o
        .setName('answer')
        .setDescription('الإجابة الصحيحة')
        .setRequired(true)
        .addChoices({ name: 'صح', value: 'true' }, { name: 'خطأ', value: 'false' })
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('remove-question')
    .setDescription('حذف سؤال من البنك برقمه (للإدارة فقط)')
    .addIntegerOption((o) => o.setName('id').setDescription('رقم السؤال').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('list-questions')
    .setDescription('عرض كل الأسئلة الموجودة في البنك (للإدارة فقط)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('reset-user')
    .setDescription('تصفير نتيجة عضو عشان يقدر يعيد الاختبار (للإدارة فقط)')
    .addUserOption((o) => o.setName('user').setDescription('العضو').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('set-threshold')
    .setDescription('تعديل نسبة النجاح المطلوبة (للإدارة فقط)')
    .addIntegerOption((o) =>
      o
        .setName('percent')
        .setDescription('النسبة المطلوبة %')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map((c) => c.toJSON());

const rest = new REST().setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    if (!process.env.BOT_TOKEN || !process.env.CLIENT_ID) {
      console.error('❌ لازم تحط BOT_TOKEN و CLIENT_ID في ملف .env قبل ما تسجل الأوامر.');
      process.exit(1);
    }

    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
        body: commands,
      });
      console.log('✅ تم تسجيل الأوامر على السيرفر المحدد (تظهر فوراً تقريباً).');
    } else {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log('✅ تم تسجيل الأوامر عالمياً (قد تأخذ حتى ساعة عشان تنتشر بكل السيرفرات).');
    }
  } catch (err) {
    console.error('❌ صار خطأ أثناء تسجيل الأوامر:', err);
  }
})();
