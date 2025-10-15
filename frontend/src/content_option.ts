export const logotext = "(MYLG!)  ";

export interface Meta {
  title: string;
  description: string;
}

export const meta: Meta = {
  title: "*MYLG!*",
  description:
    "MYLG!: Innovatively connecting advanced technology and creative vision. Discover our strategic branding, immersive event design, and expressive digital artistry.",
};

export interface IntroData {
  title: string;
  animated: Record<string, string>;
  description: string;
  your_img_url: string;
}

export const introdata: IntroData = {
  title: "MYLG!",
  animated: {
    first: "We embrace design",
    second: "We craft digital marvels",
    third: "We breathe life into brands",
    fourth: "We make pixels dance",
    fifth: "We transform creative vision into reality",
    sixth: "We create compelling digital narratives",
    seventh: "We code the extraordinary",
    eighth: "We cultivate immersive experiences",
    ninth: "We harmonize form and function",
    tenth: "We architect digital journeys",
  },
  description:
    "★ We're in the business of turning the 'impossible'  dial to 'watch this'✨ Hailing from Europe and fueled by Los Angeles vibes, here, abstract ideas become tangible realities that leave a lasting impression. We're all about pushing boundaries, breaking molds, and creating digital experiences that truly resonate. Let's turn your visions into something extraordinary together.✌★",
  your_img_url:
    "https://images.unsplash.com/photo-1514790193030-c89d266d5a9d",
};

export interface DataAbout {
  title: string;
  aboutme: string;
}

export const dataabout: DataAbout = {
  title: "A Bit About Us",
  aboutme:
    "Ready to pitch a game-changer, throw a bash, or take over the world? We’re the jam to your toast, here to whip up presentations that’ll make hearts race and jaws drop!",
};

export interface Skill {
  name: string;
  value: number;
}

export const skills: Skill[] = [
  { name: "Pre-Production Immersive Experience", value: 100 },
  { name: "Dynamic Art Direction", value: 100 },
  { name: "Ultra-Realistic 3D Renderings", value: 100 },
  { name: "Graphic Design", value: 100 },
  { name: "Brand Strategy", value: 100 },
  { name: "Intuitive UI/UX Design", value: 100 },
  { name: "Picture-Perfect Photography", value: 100 },
];

export interface Service {
  title: string;
  description: string;
}

export const services: Service[] = [
  {
    title: `Tailored Pre-Production Immersive Experiences`,
    description:
      `*The Ultimate Project Joyride! * Get up-close with your design before it’s even made! Our interactive 2D/3D prototypes are like stepping into your project. It’s your vision, your world - no surprises, just perfection. `,
  },
  {
    title: `Experiential Design & Live Show Production`,
    description:
      `*Vision to Reality* We're the architects of awe, taking your vision from ethereal concept to tangible wonder. Whether it’s an electrifying live show, an immersive space, or a captivating campaign, our art direction and production mastery breathe life into ideas. With savvy marketing and visionary design, your creation won’t just be seen, it’ll be felt. Witness the metamorphosis!`
  },
  {
    title: `Ultra-Realistic 3D Renderings`,
    description:
      `*Get Real... Like, REALLY Real!* We dish out 3D renders so lifelike, you’ll want to touch ‘em. Peek into your project’s future; it’s looking pretty snazzy!`
  },
  {
    title: `Graphic Design`,
    description:
      `*Painting Dreams with Pixels* Your story + our design chops = Mind-blowing graphics. Let’s make magic.`
  },
  {
    title: `Brand Strategy`,
    description:
      `*Unforgettable. That’s What You Are. * We craft brand identities that stick like glue and sing like nightingales. Be iconic.`
  },
  {
    title: `Intuitive UI/UX Design`,
    description:
      `*Smooth Surfin’ on Digital Waves * Your digital space, tailor-cut to perfection. Engaging, intuitive, and oh-so-slick.`
  },
  {
    title: `Picture-Perfect Photography`,
    description:
      `*Capture More Than a Moment* Pictures that speak, laugh, and take your breath away. Freeze time - the awesome way.`
  },
  {
    title: `+The Creative Cosmos is the Limit!`,
    description:
      `Plus, we've got everything from Sound design to NFT & Web3 Services, Mobile App Development, and more! The creative cosmos is the limit! `,
  },
];

export interface ContactConfig {
  YOUR_EMAIL: string;
  YOUR_PHONE: string;
  description: string;
  YOUR_SERVICE_ID: string;
  YOUR_TEMPLATE_ID: string;
  YOUR_USER_ID: string;
}

export const contactConfig: ContactConfig = {
  YOUR_EMAIL: "info@mylg.com",
  YOUR_PHONE: "(949)701-8836",
  description:
    "We seriously can't wait to hear from you! Our team is super pumped and ready to deliver top-notch solutions that'll blow your mind 💥 Got questions about our services? Wanna brainstorm a killer project? Or maybe you just wanna say 'Hey!' and spread some good vibes? No worries, we're here for you! Don't hesitate, reach out and let's make magic together. You won't regret it, promise! 🙌",
  // create an emailjs.com account
  // check out this tutorial https://www.emailjs.com/docs/examples/reactjs/
  YOUR_SERVICE_ID: "service_id",
  YOUR_TEMPLATE_ID: "template_id",
  YOUR_USER_ID: "user_id",
};

export interface SocialProfiles {
  github: string;
  facebook: string;
  linkedin: string;
  twitter: string;
}

export const socialprofils: SocialProfiles = {
  github: "https://github.com",
  facebook: "https://facebook.com",
  linkedin: "https://linkedin.com",
  twitter: "https://twitter.com",
};










