/**
 * Fix @react-native-community/datetimepicker release builds with AGP 9/Kotlin 2.
 *
 * The module has Java code that references Kotlin Material picker modules in
 * the same Android library. In this workspace the Kotlin classes are compiled
 * first, but compileReleaseJavaWithJavac does not see tmp/kotlin-classes unless
 * it is added to the task classpath.
 */
const fs = require('fs');
const path = require('path');

let patched = 0;

const nodeModulesRoots = [
    path.resolve(__dirname, '..', 'node_modules'),
    path.resolve(__dirname, '..', 'packages/happy-app/node_modules'),
];

const patchBlock = `
afterEvaluate {
    android.libraryVariants.all { variant ->
        def capitalizedVariantName = variant.name.capitalize()
        tasks.named("compile\${capitalizedVariantName}JavaWithJavac").configure { javacTask ->
            javacTask.classpath += files("$buildDir/tmp/kotlin-classes/\${variant.name}")
        }
    }
}
`;

for (const nodeModulesRoot of nodeModulesRoots) {
    const buildGradlePath = path.join(
        nodeModulesRoot,
        '@react-native-community/datetimepicker/android/build.gradle'
    );

    if (!fs.existsSync(buildGradlePath)) {
        continue;
    }

    const content = fs.readFileSync(buildGradlePath, 'utf8');
    if (content.includes('tmp/kotlin-classes/${variant.name}')) {
        continue;
    }

    fs.writeFileSync(buildGradlePath, `${content.trimEnd()}\n${patchBlock}`, 'utf8');
    patched++;
}

if (patched > 0) {
    console.log(`[postinstall] Patched datetimepicker Kotlin classpath in ${patched} install(s)`);
}
