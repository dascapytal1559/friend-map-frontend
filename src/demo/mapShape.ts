// The shape of the real map in numbers, written by `npm run demo-shape`
// (server/demo-shape.ts) in 2026-10: counts and distributions only,
// never a name, a title, a handle, an id or a message (DemoShape in shape.ts).
// The static demo's made-up crowd (generate.ts) is tuned to it. Do not edit by hand.

import type { DemoShape } from "./shape.ts";

export const SHAPE: DemoShape = {
  "takenAt": "2026-10",
  "people": {
    "shown": 814,
    "archivedByHand": 1004,
    "archivedByRule": {
      "unknown": 615,
      "they-only": 165,
      "you-only": 68,
      "groups-silent": 12132,
      "groups-wrote": 4088,
      "marketplace": 363,
      "no-messages": 108,
      "no-name": 2832
    },
    "reachOut": 25
  },
  "messagesPerPerson": [
    {
      "from": 0,
      "to": 1,
      "count": 13
    },
    {
      "from": 1,
      "to": 3,
      "count": 25
    },
    {
      "from": 3,
      "to": 6,
      "count": 50
    },
    {
      "from": 6,
      "to": 11,
      "count": 68
    },
    {
      "from": 11,
      "to": 21,
      "count": 90
    },
    {
      "from": 21,
      "to": 51,
      "count": 133
    },
    {
      "from": 51,
      "to": 101,
      "count": 107
    },
    {
      "from": 101,
      "to": 201,
      "count": 79
    },
    {
      "from": 201,
      "to": 501,
      "count": 87
    },
    {
      "from": 501,
      "to": 1001,
      "count": 46
    },
    {
      "from": 1001,
      "to": 2001,
      "count": 38
    },
    {
      "from": 2001,
      "to": 5001,
      "count": 44
    },
    {
      "from": 5001,
      "to": 10001,
      "count": 20
    },
    {
      "from": 10001,
      "to": 20001,
      "count": 7
    },
    {
      "from": 20001,
      "to": 50001,
      "count": 4
    },
    {
      "from": 50001,
      "to": null,
      "count": 3
    }
  ],
  "myShare": [
    {
      "from": 0,
      "to": 0.1,
      "count": 7
    },
    {
      "from": 0.1,
      "to": 0.2,
      "count": 5
    },
    {
      "from": 0.2,
      "to": 0.3,
      "count": 35
    },
    {
      "from": 0.3,
      "to": 0.4,
      "count": 118
    },
    {
      "from": 0.4,
      "to": 0.5,
      "count": 280
    },
    {
      "from": 0.5,
      "to": 0.6,
      "count": 230
    },
    {
      "from": 0.6,
      "to": 0.7,
      "count": 53
    },
    {
      "from": 0.7,
      "to": 0.8,
      "count": 5
    },
    {
      "from": 0.8,
      "to": 0.9,
      "count": 4
    },
    {
      "from": 0.9,
      "to": null,
      "count": 8
    }
  ],
  "lastSpoke": [
    {
      "from": 0,
      "to": 8,
      "count": 16
    },
    {
      "from": 8,
      "to": 31,
      "count": 46
    },
    {
      "from": 31,
      "to": 91,
      "count": 25
    },
    {
      "from": 91,
      "to": 366,
      "count": 104
    },
    {
      "from": 366,
      "to": 731,
      "count": 60
    },
    {
      "from": 731,
      "to": 1827,
      "count": 176
    },
    {
      "from": 1827,
      "to": null,
      "count": 374
    }
  ],
  "firstSpoke": [
    {
      "from": 0,
      "to": 1,
      "count": 24
    },
    {
      "from": 1,
      "to": 2,
      "count": 31
    },
    {
      "from": 2,
      "to": 5,
      "count": 188
    },
    {
      "from": 5,
      "to": 10,
      "count": 298
    },
    {
      "from": 10,
      "to": null,
      "count": 260
    }
  ],
  "closeness": [
    {
      "from": 0,
      "to": 5e-324,
      "count": 34
    },
    {
      "from": 5e-324,
      "to": 1e-9,
      "count": 201
    },
    {
      "from": 1e-9,
      "to": 0.01,
      "count": 374
    },
    {
      "from": 0.01,
      "to": 0.1,
      "count": 51
    },
    {
      "from": 0.1,
      "to": 1,
      "count": 44
    },
    {
      "from": 1,
      "to": 3,
      "count": 24
    },
    {
      "from": 3,
      "to": 10,
      "count": 20
    },
    {
      "from": 10,
      "to": 30,
      "count": 14
    },
    {
      "from": 30,
      "to": 100,
      "count": 17
    },
    {
      "from": 100,
      "to": 300,
      "count": 23
    },
    {
      "from": 300,
      "to": 1000,
      "count": 10
    },
    {
      "from": 1000,
      "to": null,
      "count": 2
    }
  ],
  "platforms": {
    "discord": {
      "people": 29,
      "messages": 10795
    },
    "imessage": {
      "people": 203,
      "messages": 56746
    },
    "instagram": {
      "people": 202,
      "messages": 56380
    },
    "messenger": {
      "people": 523,
      "messages": 760983
    },
    "signal": {
      "people": 34,
      "messages": 6689
    },
    "telegram": {
      "people": 36,
      "messages": 141331
    },
    "wechat": {
      "people": 45,
      "messages": 215406
    },
    "whatsapp": {
      "people": 130,
      "messages": 112209
    },
    "x": {
      "people": 0,
      "messages": 10
    },
    "phone": {
      "people": 29,
      "messages": 0
    }
  },
  "platformsPerPerson": [
    {
      "from": 1,
      "to": 2,
      "count": 535
    },
    {
      "from": 2,
      "to": 3,
      "count": 192
    },
    {
      "from": 3,
      "to": null,
      "count": 84
    }
  ],
  "groups": {
    "count": 734,
    "titled": 705,
    "sizes": [
      {
        "from": 2,
        "to": 4,
        "count": 206
      },
      {
        "from": 4,
        "to": 7,
        "count": 173
      },
      {
        "from": 7,
        "to": 13,
        "count": 101
      },
      {
        "from": 13,
        "to": 31,
        "count": 65
      },
      {
        "from": 31,
        "to": 101,
        "count": 53
      },
      {
        "from": 101,
        "to": 301,
        "count": 60
      },
      {
        "from": 301,
        "to": 1001,
        "count": 6
      },
      {
        "from": 1001,
        "to": null,
        "count": 1
      }
    ],
    "shown": [
      {
        "from": 0,
        "to": 1,
        "count": 184
      },
      {
        "from": 1,
        "to": 2,
        "count": 88
      },
      {
        "from": 2,
        "to": 4,
        "count": 288
      },
      {
        "from": 4,
        "to": 7,
        "count": 100
      },
      {
        "from": 7,
        "to": 13,
        "count": 52
      },
      {
        "from": 13,
        "to": 31,
        "count": 21
      },
      {
        "from": 31,
        "to": 101,
        "count": 1
      },
      {
        "from": 101,
        "to": null,
        "count": 0
      }
    ],
    "messages": [
      {
        "from": 0,
        "to": 1,
        "count": 0
      },
      {
        "from": 1,
        "to": 3,
        "count": 65
      },
      {
        "from": 3,
        "to": 6,
        "count": 57
      },
      {
        "from": 6,
        "to": 11,
        "count": 54
      },
      {
        "from": 11,
        "to": 21,
        "count": 85
      },
      {
        "from": 21,
        "to": 51,
        "count": 108
      },
      {
        "from": 51,
        "to": 101,
        "count": 86
      },
      {
        "from": 101,
        "to": 201,
        "count": 100
      },
      {
        "from": 201,
        "to": 501,
        "count": 76
      },
      {
        "from": 501,
        "to": 1001,
        "count": 32
      },
      {
        "from": 1001,
        "to": 2001,
        "count": 17
      },
      {
        "from": 2001,
        "to": 5001,
        "count": 15
      },
      {
        "from": 5001,
        "to": 10001,
        "count": 3
      },
      {
        "from": 10001,
        "to": 20001,
        "count": 5
      },
      {
        "from": 20001,
        "to": 50001,
        "count": 6
      },
      {
        "from": 50001,
        "to": null,
        "count": 3
      }
    ],
    "myShare": [
      {
        "from": 0,
        "to": 0.1,
        "count": 309
      },
      {
        "from": 0.1,
        "to": 0.2,
        "count": 90
      },
      {
        "from": 0.2,
        "to": 0.3,
        "count": 83
      },
      {
        "from": 0.3,
        "to": 0.4,
        "count": 79
      },
      {
        "from": 0.4,
        "to": 0.5,
        "count": 33
      },
      {
        "from": 0.5,
        "to": 0.6,
        "count": 29
      },
      {
        "from": 0.6,
        "to": 0.7,
        "count": 10
      },
      {
        "from": 0.7,
        "to": 0.8,
        "count": 1
      },
      {
        "from": 0.8,
        "to": 0.9,
        "count": 0
      },
      {
        "from": 0.9,
        "to": null,
        "count": 78
      }
    ],
    "lastSpoke": [
      {
        "from": 0,
        "to": 8,
        "count": 11
      },
      {
        "from": 8,
        "to": 31,
        "count": 18
      },
      {
        "from": 31,
        "to": 91,
        "count": 18
      },
      {
        "from": 91,
        "to": 366,
        "count": 58
      },
      {
        "from": 366,
        "to": 731,
        "count": 66
      },
      {
        "from": 731,
        "to": 1827,
        "count": 181
      },
      {
        "from": 1827,
        "to": null,
        "count": 360
      }
    ],
    "years": [
      {
        "from": 0,
        "to": 1,
        "count": 584
      },
      {
        "from": 1,
        "to": 2,
        "count": 55
      },
      {
        "from": 2,
        "to": 5,
        "count": 62
      },
      {
        "from": 5,
        "to": 10,
        "count": 10
      },
      {
        "from": 10,
        "to": null,
        "count": 1
      }
    ],
    "perPerson": [
      {
        "from": 0,
        "to": 1,
        "count": 364
      },
      {
        "from": 1,
        "to": 2,
        "count": 193
      },
      {
        "from": 2,
        "to": 4,
        "count": 106
      },
      {
        "from": 4,
        "to": 7,
        "count": 65
      },
      {
        "from": 7,
        "to": 13,
        "count": 59
      },
      {
        "from": 13,
        "to": null,
        "count": 27
      }
    ]
  },
  "tags": {
    "count": 23,
    "peoplePerTag": [
      {
        "from": 0,
        "to": 1,
        "count": 1
      },
      {
        "from": 1,
        "to": 2,
        "count": 4
      },
      {
        "from": 2,
        "to": 6,
        "count": 2
      },
      {
        "from": 6,
        "to": 11,
        "count": 4
      },
      {
        "from": 11,
        "to": 26,
        "count": 4
      },
      {
        "from": 26,
        "to": 51,
        "count": 3
      },
      {
        "from": 51,
        "to": null,
        "count": 5
      }
    ],
    "perPerson": [
      {
        "from": 0,
        "to": 1,
        "count": 311
      },
      {
        "from": 1,
        "to": 2,
        "count": 493
      },
      {
        "from": 2,
        "to": 3,
        "count": 10
      },
      {
        "from": 3,
        "to": 4,
        "count": 0
      },
      {
        "from": 4,
        "to": 6,
        "count": 0
      },
      {
        "from": 6,
        "to": null,
        "count": 0
      }
    ]
  },
  "fields": {
    "location": {
      "people": 699,
      "values": 50
    }
  },
  "reactions": {
    "fromMe": 4380,
    "fromThem": 11128
  },
  "openings": {
    "byMe": 1856,
    "byThem": 2504
  },
  "activity": {
    "from": "2009-10",
    "counts": [
      2,
      1,
      0,
      4,
      0,
      5,
      9,
      26,
      10,
      90,
      38,
      176,
      621,
      211,
      125,
      184,
      184,
      712,
      303,
      413,
      92,
      634,
      1893,
      4124,
      1417,
      1463,
      1393,
      913,
      818,
      1755,
      3370,
      3101,
      3444,
      2342,
      1349,
      991,
      1629,
      2559,
      842,
      724,
      744,
      1915,
      2162,
      3263,
      1531,
      1350,
      2259,
      2244,
      6062,
      8647,
      5370,
      2659,
      3399,
      3001,
      5689,
      5468,
      6119,
      4035,
      5458,
      3370,
      2905,
      1562,
      788,
      919,
      960,
      3842,
      4108,
      2852,
      3394,
      2393,
      2740,
      961,
      1240,
      1046,
      1458,
      1341,
      850,
      3038,
      12268,
      9988,
      10489,
      12115,
      12119,
      22415,
      11393,
      12114,
      12327,
      10813,
      12181,
      23296,
      19707,
      18636,
      18245,
      13808,
      11160,
      9187,
      9868,
      9736,
      11065,
      10523,
      8075,
      11519,
      5670,
      18001,
      12248,
      14865,
      9413,
      7925,
      9021,
      7560,
      9738,
      10152,
      10710,
      10056,
      6579,
      7024,
      5586,
      7524,
      8605,
      8699,
      9771,
      6234,
      6117,
      7342,
      5305,
      9237,
      5210,
      4532,
      7133,
      7786,
      7133,
      11391,
      13162,
      14958,
      9258,
      10448,
      15746,
      15814,
      22123,
      8833,
      13829,
      11047,
      16763,
      14562,
      8121,
      10459,
      7083,
      7068,
      5951,
      6250,
      5973,
      5532,
      6582,
      7444,
      5189,
      5806,
      4997,
      6408,
      5244,
      7250,
      6819,
      8895,
      6107,
      9689,
      6357,
      10311,
      8037,
      6821,
      9124,
      13760,
      15340,
      13844,
      9954,
      13837,
      9739,
      9284,
      8535,
      9153,
      9815,
      9927,
      8865,
      8159,
      6965,
      6247,
      8535,
      9781,
      11103,
      10076,
      8349,
      6946,
      7827,
      7586,
      8176,
      7730,
      6097,
      5838,
      7939,
      8132,
      6235,
      7025,
      5218,
      3259,
      4646,
      3598,
      246
    ]
  },
  "calls": {
    "answered": 942,
    "missed": 513,
    "people": 115,
    "perPerson": [
      {
        "from": 1,
        "to": 3,
        "count": 63
      },
      {
        "from": 3,
        "to": 6,
        "count": 25
      },
      {
        "from": 6,
        "to": 11,
        "count": 11
      },
      {
        "from": 11,
        "to": 21,
        "count": 7
      },
      {
        "from": 21,
        "to": 51,
        "count": 5
      },
      {
        "from": 51,
        "to": 101,
        "count": 2
      },
      {
        "from": 101,
        "to": 201,
        "count": 2
      },
      {
        "from": 201,
        "to": 501,
        "count": 0
      },
      {
        "from": 501,
        "to": 1001,
        "count": 0
      },
      {
        "from": 1001,
        "to": 2001,
        "count": 0
      },
      {
        "from": 2001,
        "to": 5001,
        "count": 0
      },
      {
        "from": 5001,
        "to": 10001,
        "count": 0
      },
      {
        "from": 10001,
        "to": 20001,
        "count": 0
      },
      {
        "from": 20001,
        "to": 50001,
        "count": 0
      },
      {
        "from": 50001,
        "to": null,
        "count": 0
      }
    ],
    "minutes": [
      {
        "from": 0,
        "to": 1,
        "count": 382
      },
      {
        "from": 1,
        "to": 3,
        "count": 189
      },
      {
        "from": 3,
        "to": 10,
        "count": 141
      },
      {
        "from": 10,
        "to": 30,
        "count": 103
      },
      {
        "from": 30,
        "to": 60,
        "count": 66
      },
      {
        "from": 60,
        "to": 120,
        "count": 42
      },
      {
        "from": 120,
        "to": null,
        "count": 19
      }
    ],
    "activity": {
      "from": "2015-08",
      "counts": [
        5,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        1,
        3,
        5,
        4,
        1,
        7,
        2,
        3,
        5,
        7,
        20,
        8,
        7,
        15,
        22,
        0,
        14,
        13,
        6,
        4,
        2,
        3,
        2,
        10,
        10,
        61,
        21,
        2,
        1,
        0,
        0,
        6,
        1,
        5,
        1,
        6,
        1,
        0,
        0,
        0,
        0,
        0,
        3,
        10,
        25,
        39,
        18,
        3,
        16,
        30,
        23,
        7,
        7,
        4,
        0,
        5,
        3,
        11,
        3,
        3,
        3,
        1,
        9,
        9,
        5,
        7,
        2,
        1,
        4,
        1,
        4,
        3,
        3,
        3,
        5,
        1,
        10,
        3,
        6,
        7,
        1,
        6,
        7,
        6,
        3,
        6,
        1,
        2,
        5,
        6,
        2,
        3,
        2,
        1,
        7,
        3,
        0,
        0,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        5,
        29,
        39,
        56,
        14,
        34,
        11,
        31,
        12,
        30,
        15,
        22,
        1
      ]
    }
  },
  "hangouts": {
    "count": 29,
    "days": 74,
    "sizes": [
      {
        "from": 1,
        "to": 2,
        "count": 17
      },
      {
        "from": 2,
        "to": 3,
        "count": 2
      },
      {
        "from": 3,
        "to": 5,
        "count": 5
      },
      {
        "from": 5,
        "to": 9,
        "count": 5
      },
      {
        "from": 9,
        "to": null,
        "count": 0
      }
    ],
    "hours": [
      {
        "from": 0,
        "to": 1,
        "count": 1
      },
      {
        "from": 1,
        "to": 2,
        "count": 3
      },
      {
        "from": 2,
        "to": 3,
        "count": 6
      },
      {
        "from": 3,
        "to": 4,
        "count": 5
      },
      {
        "from": 4,
        "to": 6,
        "count": 11
      },
      {
        "from": 6,
        "to": 9,
        "count": 2
      },
      {
        "from": 9,
        "to": null,
        "count": 1
      }
    ],
    "withOthers": 8
  }
};
