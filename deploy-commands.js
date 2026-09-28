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

const isId = (v) => typeof v === 'string' && /^\d{17,20}$/.test(v.trim());

const token = (process.env.BOT_TOKEN || '').trim();
const clientId = (process.env.CLIENT_ID || '').trim();
const guildId = (process.env.GUILD_ID || '').trim();

(async () => {
  if (!token || token.includes('ضع_')) {
    console.error('❌ BOT_TOKEN فاضي أو لسا مكتوب فيه النص الافتراضي. عدّل ملف .env (لازم اسمه .env مو .env.example).');
    process.exit(1);
  }
  if (!isId(clientId)) {
    console.error('❌ CLIENT_ID غلط. لازم يكون أرقام فقط (Application ID من General Information). القيمة الحالية: "' + clientId + '"');
    process.exit(1);
  }
  if (guildId && !isId(guildId)) {
    console.error('❌ GUILD_ID غلط. إما تحط ايدي السيرفر أرقام فقط، أو امسح السطر كله من .env. القيمة الحالية: "' + guildId + '"');
    process.exit(1);
  }

  const rest = new REST().setToken(token);
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log('✅ تم تسجيل ' + commands.length + ' أوامر على السيرفر ' + guildId + ' (تظهر فوراً تقريباً).');
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log('✅ تم تسجيل ' + commands.length + ' أوامر عالمياً (قد تأخذ حتى ساعة).');
    }
    console.log('لو ما ظهرت الأوامر بديسكورد: اقفل التطبيق وافتحه، أو اضغط Ctrl+R.');
  } catch (err) {
    console.error('❌ فشل تسجيل الأوامر. الكود: ' + err.code + ' | ' + err.message);
    if (err.status === 401) console.error('→ التوكن غلط. سوّ Reset Token من Developer Portal وانسخه من جديد.');
    if (err.code === 50001) console.error('→ البوت مو موجود بالسيرفر، أو انضاف بدون صلاحية applications.commands. ادعه من جديد برابط فيه bot + applications.commands.');
    if (err.code === 10002) console.error('→ CLIENT_ID غلط.');
    if (err.code === 10004) console.error('→ GUILD_ID غلط أو البوت مو بذاك السيرفر.');
  }
})();
