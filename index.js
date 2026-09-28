require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'guilds.json');
const RESPONSE_TIMEOUT_MS = 5 * 60 * 1000; // 5 دقايق لكل سؤال
const RETRY_COOLDOWN_MS = 60 * 60 * 1000; // ساعة واحدة قبل السماح بإعادة المحاولة بعد الرسوب

// ---------------------------------------------------------------------------
// تخزين البيانات (ملف JSON بسيط لكل سيرفر: الإعدادات + بنك الأسئلة + النتائج)
// ---------------------------------------------------------------------------
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getGuildData(data, guildId) {
  if (!data[guildId]) {
    data[guildId] = {
      config: {
        panelChannelId: null,
        logChannelId: null,
        passRoleId: null,
        threshold: 80,
        questionCount: 7,
      },
      questions: [],
      results: {},
    };
  }
  return data[guildId];
}

// شخابيط اللي داخلين الاختبار الحين (بالذاكرة، عشان نمنع فتح اختبارين بنفس الوقت)
const activeTests = new Set();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once('ready', () => {
  console.log(`✅ تم تسجيل الدخول باسم ${client.user.tag}`);
});

// ---------------------------------------------------------------------------
// التوجيه الرئيسي للتفاعلات
// ---------------------------------------------------------------------------
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
    } else if (interaction.isButton() && interaction.customId === 'start_test') {
      await handleStartButton(interaction);
    }
  } catch (err) {
    console.error(err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '⚠️ صار خطأ غير متوقع.', ephemeral: true }).catch(() => {});
    }
  }
});

// ---------------------------------------------------------------------------
// أوامر السلاش (كلها للإدارة إلا ما يستخدمه العضو عن طريق الزر)
// ---------------------------------------------------------------------------
async function handleSlashCommand(interaction) {
  const { commandName } = interaction;
  const data = loadData();
  const guildData = getGuildData(data, interaction.guildId);
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

  if (!isAdmin) {
    return interaction.reply({ content: '🚫 هذا الأمر للإدارة فقط.', ephemeral: true });
  }

  switch (commandName) {
    case 'setup-panel': {
      const channel = interaction.options.getChannel('channel');
      const logChannel = interaction.options.getChannel('log-channel');
      const role = interaction.options.getRole('pass-role');
      const threshold = interaction.options.getInteger('threshold') ?? 80;
      const questionCount = interaction.options.getInteger('question-count') ?? 7;

      guildData.config.panelChannelId = channel.id;
      guildData.config.logChannelId = logChannel.id;
      guildData.config.passRoleId = role.id;
      guildData.config.threshold = threshold;
      guildData.config.questionCount = questionCount;
      saveData(data);

      const embed = new EmbedBuilder()
        .setTitle('📋 اختبار الانضمام')
        .setDescription(
          'اضغط على الزر تحت عشان تبدأ الاختبار.\nراح يرسل لك البوت الأسئلة في الخاص (تأكد إن الخاص مفتوح).'
        )
        .setColor(0x5865f2);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('start_test')
          .setLabel('ابدأ الاختبار')
          .setStyle(ButtonStyle.Success)
          .setEmoji('📝')
      );

      await channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: '✅ تم إعداد لوحة الاختبار بنجاح.', ephemeral: true });
    }

    case 'add-question': {
      const text = interaction.options.getString('question');
      const answer = interaction.options.getString('answer') === 'true';
      const nextId = guildData.questions.length
        ? Math.max(...guildData.questions.map((q) => q.id)) + 1
        : 1;
      guildData.questions.push({ id: nextId, text, answer });
      saveData(data);
      return interaction.reply({
        content: `✅ تمت إضافة السؤال رقم **${nextId}**:\n> ${text}\nالإجابة الصحيحة: ${answer ? 'صح ✅' : 'خطأ ❌'}`,
        ephemeral: true,
      });
    }

    case 'remove-question': {
      const id = interaction.options.getInteger('id');
      const before = guildData.questions.length;
      guildData.questions = guildData.questions.filter((q) => q.id !== id);
      saveData(data);
      if (guildData.questions.length === before) {
        return interaction.reply({ content: `⚠️ ما لقيت سؤال بالرقم ${id}.`, ephemeral: true });
      }
      return interaction.reply({ content: `🗑️ تم حذف السؤال رقم ${id}.`, ephemeral: true });
    }

    case 'list-questions': {
      if (!guildData.questions.length) {
        return interaction.reply({ content: 'بنك الأسئلة فاضي حالياً. أضف أسئلة بأمر `/add-question`.', ephemeral: true });
      }
      const lines = guildData.questions.map(
        (q) => `**#${q.id}** — ${q.text} → (${q.answer ? 'صح ✅' : 'خطأ ❌'})`
      );
      return interaction.reply({
        content: `📚 بنك الأسئلة (${guildData.questions.length} سؤال):\n` + lines.join('\n'),
        ephemeral: true,
      });
    }

    case 'reset-user': {
      const user = interaction.options.getUser('user');
      delete guildData.results[user.id];
      activeTests.delete(`${interaction.guildId}-${user.id}`);
      saveData(data);
      return interaction.reply({ content: `🔄 تم تصفير نتيجة **${user.tag}**، يقدر يعيد الاختبار الحين.`, ephemeral: true });
    }

    case 'set-threshold': {
      const threshold = interaction.options.getInteger('percent');
      guildData.config.threshold = threshold;
      saveData(data);
      return interaction.reply({ content: `✅ تم تعديل نسبة النجاح إلى **${threshold}%**.`, ephemeral: true });
    }

    default:
      return interaction.reply({ content: 'أمر غير معروف.', ephemeral: true });
  }
}

// ---------------------------------------------------------------------------
// عند الضغط على زر "ابدأ الاختبار"
// ---------------------------------------------------------------------------
async function handleStartButton(interaction) {
  const data = loadData();
  const guildData = getGuildData(data, interaction.guildId);
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const key = `${guildId}-${userId}`;

  const existing = guildData.results[userId];
  if (existing && existing.status === 'passed') {
    return interaction.reply({
      content: '✅ أنت قدمت الاختبار من قبل ونجحت فيه. تواصل مع الإدارة إذا تبي تعيده.',
      ephemeral: true,
    });
  }

  if (existing && existing.status === 'failed') {
    const elapsedMs = Date.now() - new Date(existing.timestamp).getTime();
    const remainingMs = RETRY_COOLDOWN_MS - elapsedMs;
    if (remainingMs > 0) {
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      return interaction.reply({
        content: `⏳ لازم تنتظر قبل إعادة المحاولة. باقي لك تقريباً **${remainingMinutes} دقيقة** عشان تقدر تحاول مرة ثانية.`,
        ephemeral: true,
      });
    }
    // انتهت مدة الانتظار، نمسح النتيجة القديمة ونسمح له يبدأ من جديد
    delete guildData.results[userId];
    saveData(data);
  }

  if (activeTests.has(key)) {
    return interaction.reply({ content: '⏳ أنت داخل الاختبار الحين، كمل بالخاص.', ephemeral: true });
  }

  if (guildData.questions.length < guildData.config.questionCount) {
    return interaction.reply({
      content: '⚠️ بنك الأسئلة عند الإدارة ما فيه أسئلة كافية حالياً. حاول بعدين.',
      ephemeral: true,
    });
  }

  let dmChannel;
  try {
    dmChannel = await interaction.user.createDM();
    await dmChannel.send('👋 أهلاً فيك! بنبدأ اختبار الانضمام الحين. جاوب على كل سؤال بالترتيب ولا تتأخر أكثر من 5 دقايق بكل سؤال.');
  } catch (err) {
    return interaction.reply({
      content: '⚠️ ما قدرت أرسل لك رسالة خاصة. افتح الخاص (Privacy Settings) وحاول تضغط الزر مرة ثانية.',
      ephemeral: true,
    });
  }

  await interaction.reply({ content: '📩 تم إرسال الاختبار لك بالخاص، روح شيك رسائلك الخاصة!', ephemeral: true });

  activeTests.add(key);
  guildData.results[userId] = { status: 'in_progress' };
  saveData(data);

  try {
    // السؤالين الثابتين
    const name = await askText(dmChannel, userId, '1️⃣ ما اسمك؟');
    const roblox = await askText(dmChannel, userId, '2️⃣ ما هو يوزر حسابك في Roblox؟');

    // اختيار أسئلة عشوائية من البنك (بدون تكرار)
    const pool = [...guildData.questions];
    const count = Math.min(guildData.config.questionCount, pool.length);
    const selected = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      selected.push(pool.splice(idx, 1)[0]);
    }

    let correct = 0;
    const answerLog = [];

    for (let i = 0; i < selected.length; i++) {
      const q = selected[i];
      const userAnswer = await askTrueFalse(dmChannel, userId, `${i + 3}️⃣ ${q.text}`);
      const isCorrect = userAnswer === q.answer;
      if (isCorrect) correct++;
      answerLog.push({ question: q.text, isCorrect });
    }

    const scorePercent = Math.round((correct / selected.length) * 100);
    const passed = scorePercent >= guildData.config.threshold;

    // نعيد تحميل البيانات وقت الحفظ عشان ما نطيح فوق أي تغيير صار بنفس الوقت
    const freshData = loadData();
    const freshGuild = getGuildData(freshData, guildId);
    freshGuild.results[userId] = {
      status: passed ? 'passed' : 'failed',
      score: scorePercent,
      name,
      roblox,
      timestamp: new Date().toISOString(),
    };
    saveData(freshData);
    activeTests.delete(key);

    // إعطاء الرتبة عند النجاح
    if (passed && freshGuild.config.passRoleId) {
      try {
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        await member.roles.add(freshGuild.config.passRoleId);
      } catch (err) {
        console.error('فشل إعطاء الرتبة:', err);
      }
    }

    const passMessage = `<@${userId}>
🎉 **تهانينا!**

يسرنا إبلاغك باجتيازك **الاختبار الإلكتروني بنجاح.**

تم اعتماد نتيجتك بنجاح، وأصبحت مؤهلاً للانتقال إلى المرحلة التالية وهي التفعيل لمعرفه متى يفتح التفعيل توجهه لروم اوقات التفعيل وراجع الاوقات و احضر بالوقت المناسب لك و لاتنسى مراجة الانظمة و القوانين لتفادي الرفض

نتمنى لك التوفيق.

**إدارة WL Emergency**`;

    const failMessage = `<@${userId}>
❌ **لم يتم اجتياز الاختبار الإلكتروني**

نأسف لإبلاغك بأنك لم تحقق درجة النجاح المطلوبة في الاختبار الإلكتروني.

يمكنك إعادة المحاولة بعد **ساعة واحدة** من وقت انتهاء الاختبار الحالي. ننصحك بمراجعة القوانين والتعليمات جيدًا قبل إعادة التقديم لزيادة فرص نجاحك.

نتمنى لك التوفيق في المحاولة القادمة.

**إدارة WL Emergency**`;

    await dmChannel.send(passed ? passMessage : failMessage);

    // إرسال السجل لروم الإدارة
    if (freshGuild.config.logChannelId) {
      try {
        const guild = await client.guilds.fetch(guildId);
        const logChannel = await guild.channels.fetch(freshGuild.config.logChannelId);
        const embed = new EmbedBuilder()
          .setTitle(passed ? '✅ اختبار ناجح' : '❌ اختبار راسب')
          .setColor(passed ? 0x57f287 : 0xed4245)
          .addFields(
            { name: 'العضو', value: `<@${userId}>`, inline: true },
            { name: 'الاسم المدخل', value: name || '—', inline: true },
            { name: 'يوزر Roblox', value: roblox || '—', inline: true },
            { name: 'النتيجة', value: `${scorePercent}%`, inline: true },
            {
              name: 'تفاصيل الإجابات',
              value: answerLog.map((a, i) => `${i + 1}. ${a.isCorrect ? '✅' : '❌'} ${a.question}`).join('\n').slice(0, 1024),
            }
          )
          .setTimestamp();
        await logChannel.send({ embeds: [embed] });
      } catch (err) {
        console.error('فشل إرسال السجل:', err);
      }
    }
  } catch (err) {
    activeTests.delete(key);
    const d = loadData();
    const g = getGuildData(d, guildId);
    delete g.results[userId];
    saveData(d);

    if (err.message === 'TIMEOUT') {
      await dmChannel.send('⌛ انتهت مهلة الإجابة (5 دقايق). ارجع للسيرفر واضغط على الزر مرة ثانية عشان تعيد المحاولة.').catch(() => {});
    } else {
      console.error(err);
      await dmChannel.send('⚠️ صار خطأ أثناء الاختبار. حاول مرة ثانية.').catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// أدوات مساعدة: سؤال نصي، وسؤال صح/خطأ بأزرار
// ---------------------------------------------------------------------------
async function askText(dmChannel, userId, question) {
  await dmChannel.send(question);
  try {
    const collected = await dmChannel.awaitMessages({
      filter: (m) => m.author.id === userId,
      max: 1,
      time: RESPONSE_TIMEOUT_MS,
      errors: ['time'],
    });
    return collected.first().content.trim();
  } catch {
    throw new Error('TIMEOUT');
  }
}

async function askTrueFalse(dmChannel, userId, question) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ans_true').setLabel('صح ✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ans_false').setLabel('خطأ ❌').setStyle(ButtonStyle.Danger)
  );
  const msg = await dmChannel.send({ content: question, components: [row] });

  try {
    const buttonInt = await msg.awaitMessageComponent({
      filter: (i) => i.user.id === userId,
      time: RESPONSE_TIMEOUT_MS,
    });
    await buttonInt.update({ components: [] });
    return buttonInt.customId === 'ans_true';
  } catch {
    throw new Error('TIMEOUT');
  }
}

client.login(process.env.BOT_TOKEN);
