// Fictional restaurant workspace, isolated from provider IDs and database rows.
export type RestaurantRequest = "booking" | "order" | "question";
export interface RestaurantChat {
  id: string;
  guest: string;
  initials: string;
  request: RestaurantRequest;
  title: string;
  status: "Needs reply" | "Confirmed" | "In progress" | "Closed";
  time: string;
  summary: string;
  context: Array<{ label: string; value: string }>;
  messages: Array<{ author: "guest" | "restaurant"; text: string; time: string }>;
}

export const restaurant = {
  name: "Basil & Ember",
  description: "Neighbourhood dining · Almaty",
  hours: "12:00–23:00",
  service: "Dine-in · takeaway · delivery",
  menu: [
    { name: "Burrata & tomatoes", description: "Basil oil · sourdough", price: 3900 },
    { name: "Wood-fired margherita", description: "Tomato · mozzarella · basil", price: 4200 },
    { name: "Truffle mushroom pasta", description: "Parmesan · cream sauce", price: 5100 },
    { name: "Lemon cheesecake", description: "Berry compote", price: 2600 },
  ],
};

export const restaurantChats: RestaurantChat[] = [
  {
    id: "restaurant-booking-01", guest: "Алия", initials: "АЛ", request: "booking",
    title: "Столик на четверых", status: "Needs reply", time: "17:42",
    summary: "Сегодня в 19:30 · 4 гостя · у окна",
    context: [{ label: "Date", value: "4 Oct · 19:30" }, { label: "Party size", value: "4 guests" }, { label: "Preference", value: "Window table" }],
    messages: [
      { author: "guest", text: "Здравствуйте! Можно забронировать столик на четверых сегодня в 19:30?", time: "17:40" },
      { author: "restaurant", text: "Добрый вечер, Алия! Подскажите, пожалуйста, есть ли пожелания по столику?", time: "17:41" },
      { author: "guest", text: "Если получится — у окна. У нас небольшой семейный ужин 😊", time: "17:42" },
    ],
  },
  {
    id: "restaurant-order-01", guest: "Данияр", initials: "ДА", request: "order",
    title: "Заказ с собой", status: "In progress", time: "17:35",
    summary: "2 пиццы · самовывоз в 18:15",
    context: [{ label: "Collection", value: "4 Oct · 18:15" }, { label: "Items", value: "2 margheritas" }, { label: "Order total", value: "8,400 ₸" }],
    messages: [
      { author: "guest", text: "Добрый день! Можно две Маргариты с собой к 18:15?", time: "17:30" },
      { author: "restaurant", text: "Здравствуйте! Две пиццы будут 8 400 ₸. Подготовим к 18:15. Есть пожелания к составу?", time: "17:32" },
      { author: "guest", text: "В одну, пожалуйста, не добавляйте базилик. Спасибо!", time: "17:35" },
    ],
  },
  {
    id: "restaurant-question-01", guest: "Мадина", initials: "МА", request: "question",
    title: "Меню и аллергены", status: "Needs reply", time: "17:28",
    summary: "Вопрос о составе пасты и десерта",
    context: [{ label: "Topic", value: "Ingredients" }, { label: "Dish", value: "Mushroom pasta" }, { label: "Follow-up", value: "Kitchen review" }],
    messages: [
      { author: "guest", text: "Здравствуйте! Есть ли в грибной пасте орехи? И можно посмотреть меню десертов?", time: "17:28" },
    ],
  },
  {
    id: "restaurant-booking-02", guest: "Тимур", initials: "ТИ", request: "booking",
    title: "Ужин на двоих", status: "Confirmed", time: "17:16",
    summary: "Сегодня в 20:00 · 2 гостя",
    context: [{ label: "Date", value: "4 Oct · 20:00" }, { label: "Party size", value: "2 guests" }, { label: "Preference", value: "Quiet corner" }],
    messages: [
      { author: "guest", text: "Добрый день, нужен столик на двоих сегодня в 20:00, желательно в спокойной зоне.", time: "17:10" },
      { author: "restaurant", text: "Тимур, записали столик на двоих в 20:00 в тихой зоне. Будем рады видеть!", time: "17:15" },
      { author: "guest", text: "Отлично, спасибо!", time: "17:16" },
    ],
  },
  {
    id: "restaurant-order-02", guest: "Анастасия", initials: "АН", request: "order",
    title: "Доставка ужина", status: "Needs reply", time: "17:02",
    summary: "Паста, пицца и чизкейк · вопрос о доставке",
    context: [{ label: "Service", value: "Delivery inquiry" }, { label: "Items", value: "3 dishes" }, { label: "Menu total", value: "11,900 ₸" }],
    messages: [
      { author: "guest", text: "Здравствуйте! Хочу заказать грибную пасту, Маргариту и лимонный чизкейк. Есть доставка вечером?", time: "17:02" },
    ],
  },
  {
    id: "restaurant-question-02", guest: "Арман", initials: "АР", request: "question",
    title: "Семейный праздник", status: "Needs reply", time: "16:54",
    summary: "12 гостей · суббота · отдельная зона",
    context: [{ label: "Occasion", value: "Family celebration" }, { label: "Party size", value: "12 guests" }, { label: "Preference", value: "Private area" }],
    messages: [
      { author: "guest", text: "Добрый день! Планируем семейный праздник на 12 человек в субботу. Можно обсудить меню и отдельную зону?", time: "16:54" },
    ],
  },
  {
    id: "restaurant-booking-03", guest: "София", initials: "СО", request: "booking",
    title: "Перенос времени брони", status: "Needs reply", time: "16:40",
    summary: "Сегодня · с 18:30 на 19:00 · 3 гостя",
    context: [{ label: "Requested time", value: "4 Oct · 19:00" }, { label: "Party size", value: "3 guests" }, { label: "Previous time", value: "18:30" }],
    messages: [
      { author: "guest", text: "Здравствуйте! У нас бронь на троих в 18:30. Можно перенести на 19:00? Немного задерживаемся.", time: "16:40" },
    ],
  },
  {
    id: "restaurant-question-03", guest: "Елена", initials: "ЕЛ", request: "question",
    title: "Часы работы", status: "Closed", time: "16:22",
    summary: "Вопрос о вечернем посещении",
    context: [{ label: "Topic", value: "Opening hours" }, { label: "Hours", value: "12:00–23:00" }, { label: "Service", value: "Dine-in" }],
    messages: [
      { author: "guest", text: "Подскажите, до скольки вы работаете сегодня?", time: "16:20" },
      { author: "restaurant", text: "В расписании ресторана указано 12:00–23:00. Перед визитом уточните время у команды ресторана.", time: "16:21" },
      { author: "guest", text: "Спасибо!", time: "16:22" },
    ],
  },
];
