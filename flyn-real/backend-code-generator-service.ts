// backend/lib/services/code-generator.ts
export async function generateCode(project: any, framework: string): Promise<string> {
  console.log(`Generating ${framework} code for project:`, project.name);

  switch (framework) {
    case 'nextjs':
      return generateNextJsCode(project);
    case 'vue':
      return generateVueCode(project);
    case 'react-native':
      return generateReactNativeCode(project);
    default:
      return generateHtmlCode(project);
  }
}

function generateNextJsCode(project: any): string {
  return `
// Generated Next.js Code
// Project: ${project.name}

import React from 'react';
import type { NextPage } from 'next';

const Home: NextPage = () => {
  return (
    <div className="container">
      <h1>${project.name}</h1>
      ${project.pages.map(p => `<section>${p.name}</section>`).join('\n')}
    </div>
  );
};

export default Home;
  `;
}

function generateVueCode(project: any): string {
  return `
<template>
  <div id="app">
    <h1>${project.name}</h1>
    ${project.pages.map(p => `<section>${p.name}</section>`).join('\n')}
  </div>
</template>

<script>
export default {
  name: '${project.name}',
  data() {
    return {
      title: '${project.name}'
    };
  }
};
</script>
  `;
}

function generateReactNativeCode(project: any): string {
  return `
import React from 'react';
import { View, Text, SafeAreaView } from 'react-native';

export default function App() {
  return (
    <SafeAreaView>
      <View>
        <Text>${project.name}</Text>
      </View>
    </SafeAreaView>
  );
}
  `;
}

function generateHtmlCode(project: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>${project.name}</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <h1>${project.name}</h1>
  ${project.pages.map(p => `<section><h2>${p.name}</h2></section>`).join('\n')}
</body>
</html>
  `;
}
HOOK

echo "✅ Created 4 more hooks and code generator service"
