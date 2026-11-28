/**
 * The modules MathScribe works sheets out with: every folder here with an
 * `index.ts` whose default export is a module class (one extending
 * `EngineModule`, src/lib/plugin.ts) is found and registered, as this file is
 * loaded (main.tsx loads it before anything else, as the tests' setup does).
 * MathScribe's own modules are here in just the same way as anyone's.
 *
 * To add a module: make a folder here, write its class in it, and export the
 * class as the default of the folder's `index.ts`. To leave one out without
 * removing it, add its folder's name to DISABLED_MODULES below.
 */
import { PATH_SEPARATOR, registerModules, type InstallableModule } from '../lib/plugin.ts'

/** Module folders here that aren't installed: `['vectors']` leaves vectors out. */
const DISABLED_MODULES: readonly string[] = []

/** Every module folder's entry, by its path: `./chemistry/index.ts`. */
const ENTRIES = import.meta.glob<{ default: InstallableModule }>('./*/index.ts', { eager: true })

/** A module's folder's name, from its entry's path: `./chemistry/index.ts` → chemistry. */
const folderOf = (path: string) => path.split(PATH_SEPARATOR)[1]

/** The modules found, each by its folder's name, those left out by DISABLED_MODULES aside. */
export const MODULE_CLASSES: ReadonlyMap<string, InstallableModule> = new Map(
  Object.entries(ENTRIES)
    .filter(([path]) => !DISABLED_MODULES.includes(folderOf(path)))
    .map(([path, entry]) => [folderOf(path), entry.default]),
)

registerModules([...MODULE_CLASSES.values()])
