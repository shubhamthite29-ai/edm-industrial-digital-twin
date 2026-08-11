// Assets/Editor/BuildWebGL.cs
// Command-line WebGL build script.
//
// Open Unity Editor and use File > Build Settings > Build, OR run via:
//   Unity.exe -quit -batchmode -projectPath <path> -executeMethod BuildWebGL.Build
//             -buildOutput <outputDir>
//
// This file is Editor-only (Assets/Editor/) and is stripped from all game builds.

using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

public static class BuildWebGL
{
    // Default output: project-root/../public/WebGL
    private static string DefaultOutput =>
        Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..","..","absolutely-below-is-a-single-master-2", "public", "WebGL"));

    /// <summary>
    /// Triggered by -executeMethod BuildWebGL.Build from command line.
    /// Reads optional -buildOutput argument for the output path.
    /// </summary>
    [MenuItem("EDM/Build WebGL")]
    public static void Build()
    {
        string output = GetCommandArg("-buildOutput") ?? DefaultOutput;
        output = Path.GetFullPath(output);
        Debug.Log($"[BuildWebGL] Output: {output}");

        // Collect all enabled scenes from Build Settings.
        string[] scenes = GetScenes();
        if (scenes.Length == 0)
        {
            Debug.LogError("[BuildWebGL] No scenes configured in Build Settings > Scenes in Build. Add at least one scene.");
            if (Application.isBatchMode) EditorApplication.Exit(1);
            return;
        }

        Directory.CreateDirectory(output);

        BuildPlayerOptions opts = new BuildPlayerOptions
        {
            scenes            = scenes,
            locationPathName  = output,
            target            = BuildTarget.WebGL,
            subtarget         = 0,
            options           = BuildOptions.None,
        };

        BuildReport report = BuildPipeline.BuildPlayer(opts);
        BuildSummary summary = report.summary;

        if (summary.result == BuildResult.Succeeded)
        {
            Debug.Log($"[BuildWebGL] SUCCESS. Output size: {summary.totalSize / 1024 / 1024} MB");
        }
        else
        {
            Debug.LogError($"[BuildWebGL] FAILED. Errors: {summary.totalErrors}");
            if (Application.isBatchMode) EditorApplication.Exit(1);
        }
    }

    private static string[] GetScenes()
    {
        var list = new System.Collections.Generic.List<string>();
        foreach (EditorBuildSettingsScene scene in EditorBuildSettings.scenes)
        {
            if (scene.enabled) list.Add(scene.path);
        }
        return list.ToArray();
    }

    private static string GetCommandArg(string argName)
    {
        string[] args = Environment.GetCommandLineArgs();
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (string.Equals(args[i], argName, StringComparison.OrdinalIgnoreCase))
                return args[i + 1];
        }
        return null;
    }
}
