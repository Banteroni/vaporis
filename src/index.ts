import axios from "axios"
import { load } from "cheerio"
import { ActionRow, ActionRowBuilder, ButtonBuilder, Client, CommandInteraction, EmbedBuilder, GatewayIntentBits, PermissionFlagsBits, REST, Routes, SlashCommandBuilder } from "discord.js"
import dotenv from "dotenv"
import { PrismaClient } from "@prisma/client"
import express from "express"
import cron from "node-cron"

export const prisma = new PrismaClient()
const api = express()
dotenv.config()
const TOKEN = process.env.TOKEN as string
const CLIENT_ID = process.env.CLIENT_ID as string


const client = new Client({ intents: [GatewayIntentBits.Guilds] })

api.get("/", async (req, res) => {
    const items = await prisma.item.findMany()
    for (const item of items) {
        const { data } = await axios.get(`https://steamcommunity.com/workshop/filedetails/?id=${item.id}`)
        const $ = load(data)
        const lastUpdated = $(".detailsStatsContainerRight div:nth-child(3)").text()
        if (lastUpdated !== item.lastUpdated) {
            //update item
            await prisma.item.update({
                where: {
                    id: item.id
                },
                data: {
                    lastUpdated
                }
            })
            //get all bindings for this item
            const bindings = await prisma.binding.findMany({
                where: {
                    itemId: item.id
                }
            })
            for (const binding of bindings) {
                const channel = await client.channels.fetch(binding.channelId)
                if (!channel) {
                    continue
                }
                if (channel.type === 0) {
                    /*                   await channel.send(`The workshop item ${item.title} has been updated!`) */
                    const embed = new EmbedBuilder().setImage(item.url).setTitle(item.title).setDescription(`The workshop item ${item.title} has been updated!`)
                    //make a component to open the workshop and mark as completed 
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(5).setLabel("Open workshop").setURL(`https://steamcommunity.com/sharedfiles/filedetails/?id=${item.id}`))
                    await channel.send({ embeds: [embed], components: [row as any] })
                }
            }
        }
    }
    res.send("ok")
})



const commands = [
    {
        data: new SlashCommandBuilder().setName("watch").setDescription("Start listening to changes regarding a workshop item").addChannelOption((option: any) => option.setName("channel").setDescription("The channel to listen to").setRequired(true)).addStringOption((option: any) => option.setName("workshop_id").setDescription("The workshop id of the item to listen to").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator).toJSON(),
        action: async (interaction: CommandInteraction) => {
            const guild = interaction.guildId

            const channel = interaction.options.get("channel", true)
            if (!channel.channel?.id) {
                await interaction.reply({ content: "Invalid channel", ephemeral: true })
                return
            }
            //check if you have write permissions in the channel
            else if (!interaction.memberPermissions?.has(PermissionFlagsBits.SendMessages)) {
                await interaction.reply({
                    content: "I don't have permission to send messages in that channel",
                    ephemeral: true
                })
                return
            }
            else if (channel.channel.type !== 0) {
                await interaction.reply({
                    content: "Invalid channel type, please only use text channels",
                    ephemeral: true
                })
                return
            }
            else {
                const { value } = interaction.options.get("workshop_id", true)
                if (!value) {
                    await interaction.reply({
                        content: "Invalid workshop id",
                        ephemeral: true
                    })
                    return
                }
                else {
                    //check if the workshop item already exists in the database
                    const item = await prisma.item.findFirst({
                        where: {
                            id: value as string
                        }
                    })
                    if (item) {
                        //check if there is any binding for this item and channel
                        const binding = await prisma.binding.findFirst({
                            where: {
                                channelId: channel.channel.id,
                                itemId: item.id
                            }
                        })
                        if (binding) {
                            await interaction.reply({
                                content: `Already listening to changes regarding ${item.title} in ${channel.channel.name}`,
                                ephemeral: true
                            })
                            return

                        }
                        else {
                            //create binding
                            //get guild from channel
                            await prisma.binding.create({
                                data: {
                                    guildId: guild,
                                    channelId: channel.channel.id,
                                    itemId: item.id
                                }
                            })
                            await interaction.reply({ content: `Started listening to changes regarding ${item.title} in ${channel.channel.name}`, ephemeral: true })
                            return
                        }
                    }
                    else {
                        //check if the item exists on the workshop
                        const response = await axios.get(`https://steamcommunity.com/sharedfiles/filedetails/?id=${value}`)
                        const $ = load(response.data)
                        //get title
                        const title = $(".workshopItemTitle").text()
                        if (!title) {
                            return interaction.reply({
                                content: "Invalid workshop id",
                                ephemeral: true
                            })
                        }
                        //get image 
                        const image = $("#previewImage").attr("src")

                        //get the third div item in detailsStatsContainerRight
                        const lastUpdated = $(".detailsStatsContainerRight div:nth-child(3)").text()

                        //create item
                        const item = await prisma.item.create({
                            data: {
                                id: value as string,
                                title,
                                url: image ? image : null,
                                lastUpdated: lastUpdated
                            }
                        })
                        //create binding
                        await prisma.binding.create({
                            data: {
                                channelId: channel.channel.id,
                                itemId: item.id,
                                guildId: guild
                            }
                        })
                        await interaction.reply({ content: `Started listening to changes regarding ${item.title} in ${channel.channel.name}`, ephemeral: true })
                        return

                    }


                }
            }
        }
    },
    {
        data: new SlashCommandBuilder().setName("list").setDescription("List all bindings").setDefaultMemberPermissions(PermissionFlagsBits.Administrator).toJSON(),
        action: async (interaction: CommandInteraction) => {
            const guild = interaction.guildId
            const bindings = await prisma.binding.findMany({
                include: {
                    item: true

                },
                where: {
                    guildId: guild
                }
            })
            let message = "No bindings found"
            if (bindings.length > 0) {
                message = ""
                for (const binding of bindings) {
                    message += `ID: ${binding.id} - ${binding.item.title} in <#${binding.channelId}>\n`
                }
            }

            await interaction.reply({ content: message, ephemeral: true })
            return
        }
    },
    {
        data: new SlashCommandBuilder().setName("unwatch").setDescription("Unwatch a binding").addStringOption((option: any) => option.setName("id").setDescription("The id of the binding to remove").setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator).toJSON(),
        action: async (interaction: CommandInteraction) => {
            const guild = interaction.guildId
            let { value } = interaction.options.get("id", true)
            if (value) {
                const BI = BigInt(value as string)
                const binding = await prisma.binding.findFirst({
                    where: {
                        id: BI,
                        guildId: guild
                    }
                })
                if (binding) {
                    await prisma.binding.delete({
                        where: {
                            id: binding.id
                        }
                    })
                    await interaction.reply({ content: `Removed binding ${binding.id}`, ephemeral: true })
                    return
                }
                else {
                    await interaction.reply({ content: "Invalid binding id", ephemeral: true })
                    return
                }
            }
            else {
                await interaction.reply({ content: "Invalid binding id", ephemeral: true })
                return
            }
        }
    }

]




const rest = new REST().setToken(TOKEN);

// and deploy your commands!
(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // The put method is used to fully refresh all commands in the guild with the current set

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands.map(command => command.data) },
        );


        console.log(`Successfully reloaded application (/) commands.`);
    } catch (error) {
        // And of course, make sure you catch and log any errors!
        console.error(error);
    }
})().then(() => {
    api.listen(process.env.PORT || 3000, () => {
        console.log(`Listening on port ${process.env.PORT || 3000}`)
    })
});

client.on("interactionCreate", async (interaction: any) => {
    if (!interaction.isCommand()) return;
    //find the command in commands, and make action
    const command = commands.find(command => command.data.name === interaction.commandName)
    if (command) {
        await command.action(interaction)
    }
    else {
        await interaction.reply({ content: "Invalid command", ephemeral: true })
        return
    }
}
)


cron.schedule('*/5 * * * *', () => {
    console.log('running a task every 5 minutes');
    fetch(`http://localhost:${process.env.PORT || 3000}`)
        .then(res => res.text())
        .then(body => console.log(body));

});

client.login(TOKEN)
