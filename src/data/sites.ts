export type ZoneId = 'costa' | 'desierto' | 'cordillera' | 'geotermia' | 'rural' | 'red';
export type EnergyStage = 'Generación' | 'Transmisión' | 'Distribución' | 'Consumo';
export type IconName =
  | 'waves'
  | 'sun'
  | 'mountain'
  | 'steam'
  | 'wind'
  | 'bolt'
  | 'city'
  | 'grid'
  | 'spark'
  | 'leaf'
  | 'battery'
  | 'pin'
  | 'compass';

export interface Zone {
  id: ZoneId;
  name: string;
  shortName: string;
  eyebrow: string;
  description: string;
  color: string;
  softColor: string;
  icon: IconName;
  center: [number, number];
  zoom: number;
}

export interface EnergySite {
  id: string;
  index: number;
  zone: ZoneId;
  stage: EnergyStage;
  name: string;
  shortName: string;
  location: string;
  capacity: string;
  capacityLabel: string;
  secondaryValue: string;
  secondaryLabel: string;
  description: string;
  fact: string;
  tags: string[];
  color: string;
  icon: IconName;
  position: [number, number];
  markerLift?: number;
  featured?: boolean;
  status: string;
}

export const zones: Zone[] = [
  {
    id: 'costa',
    name: 'Costa y océano',
    shortName: 'Costa',
    eyebrow: 'Energía del mar',
    description:
      'Mareas, olas y vientos marinos convierten el Pacífico en una fuente de energía constante.',
    color: '#4ed3ca',
    softColor: '#d9f7f2',
    icon: 'waves',
    center: [-8.6, -1.2],
    zoom: 1.16,
  },
  {
    id: 'desierto',
    name: 'Desierto de Atacama',
    shortName: 'Desierto',
    eyebrow: 'El sol más intenso',
    description:
      'La radiación más alta del mundo alimenta plantas fotovoltaicas y tecnología solar de concentración.',
    color: '#f4bf5f',
    softColor: '#fdf0cf',
    icon: 'sun',
    center: [4.1, -9.4],
    zoom: 1.17,
  },
  {
    id: 'cordillera',
    name: 'Cordillera de los Andes',
    shortName: 'Cordillera',
    eyebrow: 'Agua que desciende',
    description:
      'Embalses y ríos de montaña transforman la fuerza del agua en electricidad regulable.',
    color: '#7db9f2',
    softColor: '#e0efff',
    icon: 'mountain',
    center: [7.9, 0.1],
    zoom: 1.17,
  },
  {
    id: 'geotermia',
    name: 'Zona geotérmica',
    shortName: 'Geotermia',
    eyebrow: 'Calor bajo tierra',
    description:
      'El vapor del subsuelo mueve turbinas con una energía limpia disponible día y noche.',
    color: '#ef8d72',
    softColor: '#ffe5db',
    icon: 'steam',
    center: [6.7, 8.5],
    zoom: 1.24,
  },
  {
    id: 'rural',
    name: 'Campos y bosques',
    shortName: 'Territorio rural',
    eyebrow: 'Viento y comunidad',
    description:
      'Parques eólicos y sistemas híbridos llevan energía renovable a los territorios del sur.',
    color: '#9acb76',
    softColor: '#e8f6dc',
    icon: 'wind',
    center: [4.3, 7.2],
    zoom: 1.12,
  },
  {
    id: 'red',
    name: 'Red y consumo',
    shortName: 'Red eléctrica',
    eyebrow: 'La energía viaja',
    description:
      'La transmisión conecta cada central con hogares, industrias y servicios de todo Chile.',
    color: '#f1c65b',
    softColor: '#fff2cf',
    icon: 'bolt',
    center: [0.5, 3.2],
    zoom: 1.13,
  },
];

export const sites: EnergySite[] = [
  {
    id: 'mareomotriz',
    index: 1,
    zone: 'costa',
    stage: 'Generación',
    name: 'Central mareomotriz',
    shortName: 'Mareomotriz',
    location: 'Estrecho del sur',
    capacity: '4,2 MW',
    capacityLabel: 'Potencia estimada',
    secondaryValue: '24 / 7',
    secondaryLabel: 'Generación predecible',
    description:
      'Las compuertas capturan el vaivén de las mareas y lo transforman en electricidad mediante turbinas bidireccionales. Un recurso tan puntual como el calendario lunar.',
    fact: 'Los canales del sur de Chile concentran algunas de las corrientes mareomotrices más potentes del planeta.',
    tags: ['Mareas', 'Turbina bidireccional', 'Energía marina'],
    color: '#37c8bd',
    icon: 'waves',
    position: [-7.15, -7.8],
    markerLift: 2.2,
    featured: true,
    status: 'En operación',
  },
  {
    id: 'undimotriz',
    index: 2,
    zone: 'costa',
    stage: 'Generación',
    name: 'Parque undimotriz',
    shortName: 'Undimotriz',
    location: 'Costa del Pacífico',
    capacity: '1,8 MW',
    capacityLabel: 'Potencia instalada',
    secondaryValue: '6 boyas',
    secondaryLabel: 'Captadores de ola',
    description:
      'Boyas articuladas acompañan el movimiento del mar. Cada ola impulsa un generador hidráulico que devuelve electricidad a la costa mediante un cable submarino.',
    fact: 'Chile posee más de 4.000 km de costa expuesta a oleaje del hemisferio sur.',
    tags: ['Olas', 'Boyas', 'Cable submarino'],
    color: '#46b9e8',
    icon: 'waves',
    position: [-10.3, -1.5],
    markerLift: 2,
    featured: true,
    status: 'Piloto demostrativo',
  },
  {
    id: 'eolico-marino',
    index: 3,
    zone: 'costa',
    stage: 'Generación',
    name: 'Parque eólico marino',
    shortName: 'Eólico marino',
    location: 'Plataforma costera',
    capacity: '480 MW',
    capacityLabel: 'Potencia instalada',
    secondaryValue: '32 turbinas',
    secondaryLabel: 'Plataforma offshore',
    description:
      'Aerogeneradores de gran altura aprovechan los vientos oceánicos, más constantes y veloces que los terrestres. La energía baja por cables submarinos hasta la costa.',
    fact: 'Una turbina marina de nueva generación puede abastecer a más de 20.000 hogares.',
    tags: ['Viento offshore', 'Submarino', 'Alta capacidad'],
    color: '#6dd0d7',
    icon: 'wind',
    position: [-11.45, 5.35],
    markerLift: 3.1,
    status: 'En operación',
  },
  {
    id: 'solar-fv',
    index: 4,
    zone: 'desierto',
    stage: 'Generación',
    name: 'Planta solar Atacama',
    shortName: 'Solar fotovoltaica',
    location: 'Desierto de Atacama',
    capacity: '1.200 MW',
    capacityLabel: 'Potencia instalada',
    secondaryValue: '2,1 M',
    secondaryLabel: 'Paneles solares',
    description:
      'Miles de paneles siguen el recorrido del sol sobre el desierto más árido del mundo. Cada celda convierte fotones en corriente continua, lista para viajar por la red.',
    fact: 'Atacama recibe una radiación solar comparable a la de Marte y entre las más altas de la Tierra.',
    tags: ['Fotovoltaica', 'Sol', 'Desierto'],
    color: '#f2c356',
    icon: 'sun',
    position: [2.35, -8.8],
    markerLift: 2.1,
    featured: true,
    status: 'En operación',
  },
  {
    id: 'csp',
    index: 5,
    zone: 'desierto',
    stage: 'Generación',
    name: 'Torre solar de concentración',
    shortName: 'Solar CSP',
    location: 'Llano de Atacama',
    capacity: '110 MW',
    capacityLabel: 'Potencia instalada',
    secondaryValue: '17,5 h',
    secondaryLabel: 'Almacenamiento térmico',
    description:
      'Miles de espejos orientables concentran la luz solar en una torre central. El calor funde sales que guardan energía y permiten generar electricidad incluso de noche.',
    fact: 'La torre de Cerro Dominador fue la primera planta termosolar de América Latina.',
    tags: ['Heliostatos', 'Sales fundidas', 'Almacenamiento'],
    color: '#f18d4f',
    icon: 'sun',
    position: [6.8, -11.55],
    markerLift: 3.25,
    featured: true,
    status: 'En operación',
  },
  {
    id: 'hidro-embalse',
    index: 6,
    zone: 'cordillera',
    stage: 'Generación',
    name: 'Central hidroeléctrica de embalse',
    shortName: 'Hidro de embalse',
    location: 'Alto Biobío',
    capacity: '1.500 MW',
    capacityLabel: 'Potencia instalada',
    secondaryValue: '8.400 hm³',
    secondaryLabel: 'Volumen de reserva',
    description:
      'Un gran embalse almacena agua de deshielo y la libera de forma controlada. La caída por las tuberías de presión mueve turbinas capaces de responder rápido a la demanda.',
    fact: 'Los embalses permiten guardar energía en forma de agua, como una batería de montaña.',
    tags: ['Embalse', 'Turbina Pelton', 'Reserva hídrica'],
    color: '#6fb3ea',
    icon: 'mountain',
    position: [8.75, -2.35],
    markerLift: 3.7,
    featured: true,
    status: 'En operación',
  },
  {
    id: 'hidro-pasada',
    index: 7,
    zone: 'cordillera',
    stage: 'Generación',
    name: 'Central hidroeléctrica de pasada',
    shortName: 'Hidro de pasada',
    location: 'Cuenca del río',
    capacity: '240 MW',
    capacityLabel: 'Potencia instalada',
    secondaryValue: 'Mínimo',
    secondaryLabel: 'Impacto en el caudal',
    description:
      'Desvía una parte del río para mover sus turbinas y luego devuelve el agua a su cauce. Sin gran embalse, aprovecha el flujo natural de la montaña.',
    fact: 'Su huella es menor que la de un embalse, pero su generación depende del caudal disponible.',
    tags: ['Pasada', 'Río', 'Baja huella'],
    color: '#6ac0c9',
    icon: 'mountain',
    position: [8.15, 3.9],
    markerLift: 2.5,
    status: 'En operación',
  },
  {
    id: 'geotermica',
    index: 8,
    zone: 'geotermia',
    stage: 'Generación',
    name: 'Planta geotérmica El Tatio',
    shortName: 'Geotérmica',
    location: 'Altiplano andino',
    capacity: '80 MW',
    capacityLabel: 'Potencia proyectada',
    secondaryValue: '280 °C',
    secondaryLabel: 'Calor del subsuelo',
    description:
      'El vapor de agua subterránea asciende a presión y hace girar turbinas. Después se condensa y se reinyecta, manteniendo el ciclo activo bajo la montaña.',
    fact: 'El campo geotérmico de El Tatio es uno de los más altos del mundo, a más de 4.200 metros.',
    tags: ['Vapor', 'Turbina de vapor', '24/7'],
    color: '#e98468',
    icon: 'steam',
    position: [6.8, 8.65],
    markerLift: 3.2,
    featured: true,
    status: 'En desarrollo',
  },
  {
    id: 'eolico-terrestre',
    index: 9,
    zone: 'rural',
    stage: 'Generación',
    name: 'Parque eólico Sierra Verde',
    shortName: 'Eólico terrestre',
    location: 'Araucanía',
    capacity: '320 MW',
    capacityLabel: 'Potencia instalada',
    secondaryValue: '54 turbinas',
    secondaryLabel: 'Generación rural',
    description:
      'Las colinas del sur canalizan vientos constantes que mueven las palas de los aerogeneradores. Los excedentes se integran a la red y a la comunidad local.',
    fact: 'Chile es uno de los líderes de América Latina en generación eólica y solar.',
    tags: ['Viento', 'Comunidad', 'Red eléctrica'],
    color: '#9bc976',
    icon: 'wind',
    position: [3.7, 1.9],
    markerLift: 3,
    status: 'En operación',
  },
  {
    id: 'hibrido',
    index: 10,
    zone: 'rural',
    stage: 'Generación',
    name: 'Sistema híbrido del sur',
    shortName: 'Híbrido renovable',
    location: 'Los Lagos',
    capacity: '45 MW',
    capacityLabel: 'Potencia combinada',
    secondaryValue: 'Solar + eólica',
    secondaryLabel: 'Con baterías',
    description:
      'Pequeños aerogeneradores, paneles y baterías trabajan en conjunto. Cuando no hay viento, el sol carga las baterías que mantienen la energía local estable.',
    fact: 'Los sistemas híbridos permiten llevar electricidad firme a zonas rurales aisladas.',
    tags: ['Híbrido', 'Baterías', 'Comunidad'],
    color: '#a7ce70',
    icon: 'battery',
    position: [3.35, 11.2],
    markerLift: 2.5,
    status: 'En operación',
  },
  {
    id: 'subestacion',
    index: 11,
    zone: 'red',
    stage: 'Transmisión',
    name: 'Subestación Valle Central',
    shortName: 'Subestación',
    location: 'Nudo de transmisión',
    capacity: '500 kV',
    capacityLabel: 'Tensión de transporte',
    secondaryValue: '6 líneas',
    secondaryLabel: 'Conexión al SEN',
    description:
      'Aquí se eleva la tensión para transportar electricidad con menos pérdidas. Desde este nudo, las líneas de alta tensión conectan la generación con todo el país.',
    fact: 'La red del SEN se extiende por más de 3.100 km, desde Arica hasta Chiloé.',
    tags: ['Alta tensión', 'Transformadores', 'SEN'],
    color: '#edc458',
    icon: 'grid',
    position: [0.8, -2.55],
    markerLift: 2.2,
    status: 'En operación',
  },
  {
    id: 'ciudad',
    index: 12,
    zone: 'red',
    stage: 'Consumo',
    name: 'Ciudad y hogares',
    shortName: 'Consumo urbano',
    location: 'Valle Central',
    capacity: '1,4 GW',
    capacityLabel: 'Demanda en hora punta',
    secondaryValue: '98 %',
    secondaryLabel: 'Cobertura eléctrica',
    description:
      'Escuelas, hospitales, industrias y hogares reciben la energía que viajó desde el mar, el desierto y la montaña. La distribución la lleva hasta cada enchufe.',
    fact: 'La energía no se consume: se transforma. Aquí, la electricidad se vuelve luz, calor y movimiento.',
    tags: ['Hogares', 'Distribución', 'Eficiencia'],
    color: '#f3cf68',
    icon: 'city',
    position: [0.55, 6.3],
    markerLift: 3.1,
    featured: true,
    status: 'Etapa final del SEN',
  },
];

export const chain = [
  {
    id: 'generacion',
    stage: 'Generación',
    label: 'Generar',
    detail: 'Sol, agua, viento y calor se transforman en electricidad.',
    icon: 'spark' as IconName,
  },
  {
    id: 'transmision',
    stage: 'Transmisión',
    label: 'Transportar',
    detail: 'La alta tensión lleva la energía a lo largo de Chile.',
    icon: 'bolt' as IconName,
  },
  {
    id: 'distribucion',
    stage: 'Distribución',
    label: 'Distribuir',
    detail: 'La red local acerca la electricidad a cada territorio.',
    icon: 'grid' as IconName,
  },
  {
    id: 'consumo',
    stage: 'Consumo',
    label: 'Consumir',
    detail: 'Hogares, industrias y servicios usan energía cada día.',
    icon: 'city' as IconName,
  },
];

export const overviewStats = [
  { value: '31,7 GW', label: 'Capacidad del SEN' },
  { value: '3.100 km', label: 'De líneas de transmisión' },
  { value: '67 %', label: 'Generación renovable' },
];

export const getZone = (id: ZoneId) => zones.find((zone) => zone.id === id)!;
export const getSite = (id: string) => sites.find((site) => site.id === id);
export const getSitesByZone = (id: ZoneId) => sites.filter((site) => site.zone === id);
